"""Check the offline ML accelerator with one matrix multiply. No training.

The accelerator is CUDA PyTorch on Windows and Linux, or MLX on Apple Silicon.
There is no CPU fallback: the script exits non-zero when neither is usable.
"""

import importlib.util
import json
import sys


def pick_accelerator() -> str:
    """Return "cuda" or "mlx", or raise RuntimeError when neither is usable."""
    if importlib.util.find_spec("torch"):
        import torch

        if torch.cuda.is_available():
            return "cuda"
    if importlib.util.find_spec("mlx"):
        import mlx.core as mx

        if mx.metal.is_available():
            return "mlx"
    raise RuntimeError(
        "No CUDA GPU (PyTorch) or Apple GPU (MLX) is available. "
        "Run `uv sync --group ml` on a machine with an NVIDIA GPU or Apple Silicon."
    )


def smoke_test(backend: str) -> dict:
    values = [[1.0, 2.0], [3.0, 4.0]]
    if backend == "cuda":
        import torch

        x = torch.tensor(values, device="cuda")
        return {
            "backend": "cuda",
            "torch": torch.__version__,
            "cuda_build": torch.version.cuda,
            "device": torch.cuda.get_device_name(0),
            "tensor_result": (x @ x).tolist(),
        }
    import mlx.core as mx

    x = mx.array(values)
    result = x @ x
    mx.eval(result)
    return {
        "backend": "mlx",
        "mlx": mx.__version__,
        "device": str(mx.default_device()),
        "tensor_result": result.tolist(),
    }


def main() -> None:
    try:
        backend = pick_accelerator()
    except RuntimeError as error:
        print(json.dumps({"backend": None, "error": str(error), "training_run": False}, indent=2))
        sys.exit(1)
    print(json.dumps({**smoke_test(backend), "training_run": False}, indent=2))


if __name__ == "__main__":
    main()
