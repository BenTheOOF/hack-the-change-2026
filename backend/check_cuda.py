"""Check the installed PyTorch runtime with a tensor operation. No training."""

import json


def main() -> None:
    import torch

    available = torch.cuda.is_available()
    device = "cuda" if available else "cpu"
    value = torch.tensor([[1.0, 2.0], [3.0, 4.0]], device=device)
    result = value @ value
    print(json.dumps({
        "torch": torch.__version__, "cuda_build": torch.version.cuda, "cuda_available": available,
        "device": torch.cuda.get_device_name(0) if available else "cpu",
        "tensor_result": result.tolist(), "training_run": False,
    }, indent=2))


if __name__ == "__main__":
    main()
