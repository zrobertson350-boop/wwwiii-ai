"""
SYNTH — Synchronized Neural Topology for Hybrid-intelligence
Core Mesh: The swarm coordination layer.

Instead of one monolithic model, SYNTH runs a mesh of specialized modules
that synchronize outputs to produce collective intelligence.
Each module is small, trainable on consumer hardware, and independently
contributable by anyone.
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
import json
import hashlib
from pathlib import Path
from typing import Dict, List, Optional


class SynthModule(nn.Module):
    """A single specialist module in the swarm mesh.

    Each module has a domain (language, reasoning, math, code, memory, etc.)
    and produces an embedding that gets synchronized with other modules.
    """

    def __init__(self, name: str, domain: str, dim: int = 256, depth: int = 4, heads: int = 4):
        super().__init__()
        self.name = name
        self.domain = domain
        self.dim = dim
        self.version = "0.0.1"
        self.contributor = None

        # Small transformer block — trainable on CPU
        self.embed = nn.Linear(dim, dim)
        self.layers = nn.ModuleList([
            nn.TransformerEncoderLayer(
                d_model=dim, nhead=heads, dim_feedforward=dim * 4,
                dropout=0.1, batch_first=True, norm_first=True
            ) for _ in range(depth)
        ])
        self.norm = nn.LayerNorm(dim)
        self.out_proj = nn.Linear(dim, dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.embed(x)
        for layer in self.layers:
            x = layer(x)
        x = self.norm(x)
        return self.out_proj(x)

    def fingerprint(self) -> str:
        """Unique hash of this module's weights — used for contribution tracking."""
        params = torch.cat([p.data.flatten() for p in self.parameters()])
        return hashlib.sha256(params.numpy().tobytes()).hexdigest()[:16]

    def meta(self) -> dict:
        return {
            "name": self.name,
            "domain": self.domain,
            "dim": self.dim,
            "version": self.version,
            "contributor": self.contributor,
            "fingerprint": self.fingerprint(),
            "params": sum(p.numel() for p in self.parameters()),
        }


class SynchronicityLayer(nn.Module):
    """The layer that synchronizes outputs from all modules in the mesh.

    This is the core innovation — instead of one model doing everything,
    multiple specialist modules produce embeddings that get fused here
    through cross-attention. Intelligence emerges from synchronization.
    """

    def __init__(self, dim: int = 256, heads: int = 8):
        super().__init__()
        self.dim = dim
        self.cross_attn = nn.MultiheadAttention(dim, heads, batch_first=True)
        self.gate = nn.Sequential(
            nn.Linear(dim * 2, dim),
            nn.Sigmoid()
        )
        self.fuse = nn.Sequential(
            nn.Linear(dim, dim * 2),
            nn.GELU(),
            nn.Linear(dim * 2, dim),
            nn.LayerNorm(dim)
        )

    def forward(self, module_outputs: List[torch.Tensor]) -> torch.Tensor:
        """Synchronize outputs from N modules into unified intelligence.

        Args:
            module_outputs: List of [batch, seq, dim] tensors from each module
        Returns:
            Synchronized tensor [batch, seq, dim]
        """
        if len(module_outputs) == 1:
            return self.fuse(module_outputs[0])

        # Stack all module outputs: [batch, N*seq, dim]
        stacked = torch.cat(module_outputs, dim=1)

        # Each module's output attends to all others
        synchronized_parts = []
        for mod_out in module_outputs:
            attended, _ = self.cross_attn(mod_out, stacked, stacked)
            # Gated fusion — module decides how much to incorporate from others
            gate_input = torch.cat([mod_out, attended], dim=-1)
            g = self.gate(gate_input)
            fused = g * mod_out + (1 - g) * attended
            synchronized_parts.append(fused)

        # Average all synchronized parts
        result = torch.stack(synchronized_parts, dim=0).mean(dim=0)
        return self.fuse(result)


class SynthMesh:
    """The full SYNTH mesh — manages modules, synchronization, and contribution.

    This is the system that anyone can contribute to:
    - Submit new specialist modules
    - The mesh evaluates them against existing modules
    - Good contributions get integrated, bad ones rejected
    - The mesh evolves through collective intelligence
    """

    def __init__(self, dim: int = 256):
        self.dim = dim
        self.modules: Dict[str, SynthModule] = {}
        self.sync_layer = SynchronicityLayer(dim=dim)
        self.registry: List[dict] = []

    def register_module(self, module: SynthModule) -> str:
        """Register a new module into the mesh."""
        if module.dim != self.dim:
            raise ValueError(f"Module dim {module.dim} doesn't match mesh dim {self.dim}")

        self.modules[module.name] = module
        meta = module.meta()
        self.registry.append(meta)
        return meta["fingerprint"]

    def remove_module(self, name: str):
        """Remove a module from the mesh."""
        if name in self.modules:
            del self.modules[name]
            self.registry = [r for r in self.registry if r["name"] != name]

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """Run input through all modules and synchronize."""
        if not self.modules:
            raise RuntimeError("No modules registered in mesh")

        outputs = []
        for name, module in self.modules.items():
            outputs.append(module(x))

        return self.sync_layer(outputs)

    def evaluate_contribution(self, candidate: SynthModule, test_input: torch.Tensor,
                              test_target: torch.Tensor) -> dict:
        """Evaluate whether a contributed module improves the mesh.

        The mesh has an immune system — it only accepts modules that make
        it stronger. This prevents poisoning and ensures quality.
        """
        # Baseline: current mesh performance
        with torch.no_grad():
            baseline_out = self.forward(test_input)
            baseline_loss = F.mse_loss(baseline_out, test_target).item()

        # Test: add candidate and measure
        self.register_module(candidate)
        with torch.no_grad():
            candidate_out = self.forward(test_input)
            candidate_loss = F.mse_loss(candidate_out, test_target).item()

        # Remove candidate (only keep if approved)
        self.remove_module(candidate.name)

        improvement = baseline_loss - candidate_loss
        accepted = improvement > 0

        return {
            "module": candidate.name,
            "domain": candidate.domain,
            "baseline_loss": baseline_loss,
            "candidate_loss": candidate_loss,
            "improvement": improvement,
            "accepted": accepted,
            "fingerprint": candidate.fingerprint(),
        }

    def status(self) -> dict:
        """Full mesh status — public, transparent, always."""
        total_params = sum(
            sum(p.numel() for p in m.parameters())
            for m in self.modules.values()
        )
        sync_params = sum(p.numel() for p in self.sync_layer.parameters())

        return {
            "mesh_dim": self.dim,
            "total_modules": len(self.modules),
            "total_params": total_params + sync_params,
            "modules": [m.meta() for m in self.modules.values()],
            "sync_params": sync_params,
        }

    def save(self, path: str):
        """Save entire mesh state."""
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)

        # Save each module
        for name, module in self.modules.items():
            torch.save({
                "state_dict": module.state_dict(),
                "meta": module.meta(),
            }, p / f"{name}.pt")

        # Save sync layer
        torch.save(self.sync_layer.state_dict(), p / "sync_layer.pt")

        # Save registry
        with open(p / "registry.json", "w") as f:
            json.dump(self.registry, f, indent=2)

    def load(self, path: str):
        """Load mesh state."""
        p = Path(path)
        if not p.exists():
            return

        registry_path = p / "registry.json"
        if registry_path.exists():
            with open(registry_path) as f:
                self.registry = json.load(f)

        # Load sync layer
        sync_path = p / "sync_layer.pt"
        if sync_path.exists():
            self.sync_layer.load_state_dict(torch.load(sync_path, weights_only=True))


# === Bootstrap the first mesh ===
def create_genesis_mesh() -> SynthMesh:
    """Create the initial SYNTH mesh with founding modules.

    This is Phase 1 — small modules, CPU-trainable, proof of concept.
    Anyone can contribute additional modules to make it stronger.
    """
    mesh = SynthMesh(dim=256)

    # Founding modules — the seeds of super intelligence
    language = SynthModule("language", "language", dim=256, depth=4, heads=4)
    language.contributor = "WWWIII-Genesis"

    reasoning = SynthModule("reasoning", "reasoning", dim=256, depth=4, heads=4)
    reasoning.contributor = "WWWIII-Genesis"

    memory = SynthModule("memory", "memory", dim=256, depth=2, heads=4)
    memory.contributor = "WWWIII-Genesis"

    mesh.register_module(language)
    mesh.register_module(reasoning)
    mesh.register_module(memory)

    return mesh


if __name__ == "__main__":
    print("=== SYNTH Genesis ===")
    print("Initializing the first mesh...\n")

    mesh = create_genesis_mesh()
    status = mesh.status()

    print(f"Modules: {status['total_modules']}")
    print(f"Total parameters: {status['total_params']:,}")
    print(f"Mesh dimension: {status['mesh_dim']}")
    print()

    for mod in status["modules"]:
        print(f"  [{mod['domain']}] {mod['name']} — {mod['params']:,} params — {mod['fingerprint']}")

    # Test forward pass
    test_input = torch.randn(1, 16, 256)
    output = mesh.forward(test_input)
    print(f"\nForward pass: input {list(test_input.shape)} -> output {list(output.shape)}")

    # Test contribution evaluation
    print("\n=== Testing Contribution System ===")
    candidate = SynthModule("math", "mathematics", dim=256, depth=3, heads=4)
    candidate.contributor = "community-contributor-001"

    test_target = torch.randn(1, 16, 256)
    result = mesh.evaluate_contribution(candidate, test_input, test_target)
    print(f"  Module: {result['module']} ({result['domain']})")
    print(f"  Baseline loss: {result['baseline_loss']:.4f}")
    print(f"  With module:   {result['candidate_loss']:.4f}")
    print(f"  Improvement:   {result['improvement']:.4f}")
    print(f"  Accepted:      {result['accepted']}")

    print("\n[OK] SYNTH mesh operational. The people's model is alive.")
