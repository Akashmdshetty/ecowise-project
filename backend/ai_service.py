# ai_service.py
"""
AI service wrapper for YOLO (Ultralytics).
- Allows safe deserialization when using PyTorch >= 2.6 by add_safe_globals().
- Loads the model once (lazy) and exposes analyze_image_file(image_path) to run inference.
- Returns a list of detection dicts: [{ 'name': str, 'conf': float, 'bbox': [x1,y1,x2,y2] }, ...]
- If model fails to load, provides graceful fallback (no crash) with informative logs.
"""

import os
import logging
from typing import List, Dict, Any

# Configure logger for ai_service
logger = logging.getLogger("ai_service")
if not logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter("[ai_service] %(levelname)s: %(message)s")
    ch.setFormatter(formatter)
    logger.addHandler(ch)
logger.setLevel(logging.INFO)

# Optional environment variables:
MODEL_WEIGHTS = os.environ.get("YOLO_WEIGHTS", "yolov8n.pt")  # default downloaded filename
MODEL_CONF_THRESH = float(os.environ.get("YOLO_CONF_THRESHOLD", "0.25"))
MODEL_DEVICE = os.environ.get("YOLO_DEVICE", "")  # e.g. "cpu" or "0"

# Lazy-loaded model object
_model = None
_model_load_error = None

def _allowlist_ultralytics_detectionmodel():
    """Allowlist ultralytics DetectionModel for torch.load in PyTorch >= 2.6."""
    try:
        import torch
        import ultralytics
        if hasattr(torch.serialization, "add_safe_globals"):
            torch.serialization.add_safe_globals([ultralytics.nn.tasks.DetectionModel])
            logger.info("add_safe_globals applied for ultralytics.nn.tasks.DetectionModel")
        else:
            logger.debug("torch.serialization.add_safe_globals not available on this PyTorch version")
    except Exception as e:
        logger.warning(f"Could not run add_safe_globals for ultralytics: {e}")

def load_model(weights: str = None, device: str = None):
    """
    Load and return a YOLO model (from ultralytics.YOLO).
    Caches the model in module-level _model.
    """
    global _model, _model_load_error
    if _model is not None:
        return _model

    if _model_load_error is not None:
        raise RuntimeError("Previous model load failed: " + str(_model_load_error))

    weights = weights or MODEL_WEIGHTS
    device = device if device is not None else MODEL_DEVICE or None

    # Attempt allowlist for safe loading (PyTorch >= 2.6)
    _allowlist_ultralytics_detectionmodel()

    try:
        from ultralytics import YOLO
        logger.info(f"Loading YOLO model from weights: {weights} device: {device or 'default'}")
        if device:
            _model = YOLO(weights, device=device)
        else:
            _model = YOLO(weights)
        logger.info("YOLO model loaded successfully.")
        return _model
    except Exception as e:
        _model_load_error = e
        logger.error(
            "Failed to load YOLO model: %s\n"
            "If this is a PyTorch 2.6+ weights pickled checkpoint error, see add_safe_globals approach.",
            e
        )
        raise

def detect_image(image_path: str, conf_thresh: float = None) -> List[Dict[str, Any]]:
    """
    Run object detection on image_path.
    Returns a list of detections: {'name': str, 'conf': float, 'bbox': [x1,y1,x2,y2], ...}
    """
    global _model
    conf_thresh = conf_thresh if conf_thresh is not None else MODEL_CONF_THRESH

    # Ensure model is loaded
    try:
        if _model is None:
            load_model()
    except Exception as e:
        logger.error("detect_image aborted because model failed to load: %s", e)
        return []

    # Validate path
    if not os.path.exists(image_path):
        logger.error("Image path not found: %s", image_path)
        return []

    try:
        # Run prediction
        results = _model.predict(source=image_path, conf=conf_thresh, device=MODEL_DEVICE or None)
        out = []
        for r in results:
            # Try extracting boxes robustly across ultralytics versions
            boxes = []
            # Preferred: iterate r.boxes if iterable
            try:
                if hasattr(r, "boxes") and getattr(r, "boxes") is not None:
                    # Attempt to iterate per-box objects
                    iter_boxes = None
                    try:
                        iter_boxes = list(r.boxes)
                    except Exception:
                        iter_boxes = None

                    if iter_boxes:
                        for b in iter_boxes:
                            # Get xyxy
                            xy = None
                            try:
                                xyobj = getattr(b, "xyxy", None) or getattr(b, "xyxy", None)
                                if xyobj is not None:
                                    if hasattr(xyobj, "tolist"):
                                        xy = xyobj.tolist()
                                    else:
                                        # try to coerce
                                        xy = [float(v) for v in xyobj]
                            except Exception:
                                xy = None

                            # fallback: some b might support indexing
                            if xy is None:
                                try:
                                    arr = list(b)
                                    if len(arr) >= 4:
                                        xy = [float(arr[0]), float(arr[1]), float(arr[2]), float(arr[3])]
                                except Exception:
                                    xy = None

                            # conf
                            try:
                                conf = float(getattr(b, "conf", None) or getattr(b, "confidence", None) or 0.0)
                            except Exception:
                                conf = 0.0

                            # class/name
                            cls_name = None
                            try:
                                cls_idx = getattr(b, "cls", None)
                                if cls_idx is None:
                                    cls_idx = getattr(b, "class_id", None)
                                if cls_idx is not None and hasattr(r, "names") and r.names:
                                    try:
                                        idx = int(cls_idx)
                                        cls_name = r.names[idx]
                                    except Exception:
                                        cls_name = str(cls_idx)
                            except Exception:
                                cls_name = None

                            if xy is None:
                                continue

                            boxes.append({
                                "name": cls_name,
                                "conf": float(conf),
                                "bbox": [float(xy[0]), float(xy[1]), float(xy[2]), float(xy[3])]
                            })
                    else:
                        # fallback: try r.boxes.xyxy / r.boxes.conf / r.boxes.cls
                        try:
                            arr = getattr(r.boxes, "xyxy", None)
                            confs = getattr(r.boxes, "conf", None)
                            cls_idxs = getattr(r.boxes, "cls", None)
                            if arr is not None:
                                # convert to list
                                if hasattr(arr, "tolist"):
                                    arr_list = arr.tolist()
                                else:
                                    arr_list = list(arr)
                                conf_list = confs.tolist() if (confs is not None and hasattr(confs, "tolist")) else [0.0]*len(arr_list)
                                cls_list = cls_idxs.tolist() if (cls_idxs is not None and hasattr(cls_idxs, "tolist")) else [None]*len(arr_list)
                                names = getattr(r, "names", None)
                                for xy, conf, cls_idx in zip(arr_list, conf_list, cls_list):
                                    name = names[int(cls_idx)] if names and cls_idx is not None else (str(int(cls_idx)) if cls_idx is not None else None)
                                    boxes.append({
                                        "name": name,
                                        "conf": float(conf),
                                        "bbox": [float(xy[0]), float(xy[1]), float(xy[2]), float(xy[3])]
                                    })
                        except Exception as e:
                            logger.debug("Could not parse r.boxes fields: %s", e)
            except Exception as e:
                logger.debug("Exception while parsing result boxes: %s", e)

            out.extend(boxes)
        return out

    except Exception as e:
        logger.exception("Error during detection: %s", e)
        return []

def health_check() -> Dict[str, Any]:
    """Return model load status and a short message."""
    global _model, _model_load_error
    status = {"model_loaded": _model is not None, "error": None}
    if _model_load_error:
        status["error"] = str(_model_load_error)
    try:
        if _model is None:
            load_model()
            status["model_loaded"] = True
    except Exception as e:
        status["error"] = str(e)
        status["model_loaded"] = False
    return status

# -----------------------
# Compatibility wrapper
# -----------------------
def analyze_image_file(image_path: str, conf_threshold: float = None) -> List[Dict[str, Any]]:
    """
    Backwards-compatible wrapper expected by app.py.
    Delegates to detect_image and returns the list of detection dicts.
    """
    return detect_image(image_path, conf_thresh=conf_threshold)

# If this module is run standalone, run a small self-test (no heavy I/O)
if __name__ == "__main__":
    logger.info("ai_service self-test. Attempting to load model...")
    try:
        load_model()
        logger.info("Model loaded OK.")
    except Exception as e:
        logger.error("Model load in self-test failed: %s", e)
