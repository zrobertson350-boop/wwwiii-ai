"""
SYNTH Contribution System

Anyone can contribute to WWWIII's super intelligence:
- Submit specialist modules (small neural nets)
- Submit training data (curated datasets)
- Submit architectural proposals (new module designs)
- Donate compute (run training on your machine)

Every contribution is tracked, evaluated, and — if accepted — rewarded.
This is the opposite of corporate AI: transparent, meritocratic, open.
"""

import json
import hashlib
import time
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Optional
import torch

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from core.mesh import SynthModule, SynthMesh


@dataclass
class Contribution:
    """A contribution to the SYNTH mesh."""
    id: str
    contributor: str
    type: str  # "module", "data", "architecture", "compute"
    domain: str
    description: str
    timestamp: float
    status: str = "pending"  # pending, evaluating, accepted, rejected
    fingerprint: Optional[str] = None
    evaluation: Optional[dict] = None
    reward_wwwiii: float = 0.0


class ContributionRegistry:
    """Tracks all contributions to SYNTH — fully transparent, immutable log."""

    def __init__(self, path: str = "contributions"):
        self.path = Path(path)
        self.path.mkdir(parents=True, exist_ok=True)
        self.contributions: list[Contribution] = []
        self._load()

    def _load(self):
        log_path = self.path / "log.json"
        if log_path.exists():
            with open(log_path) as f:
                data = json.load(f)
                self.contributions = [Contribution(**c) for c in data]

    def _save(self):
        with open(self.path / "log.json", "w") as f:
            json.dump([asdict(c) for c in self.contributions], f, indent=2)

    def submit_module(self, module: SynthModule, contributor: str,
                      description: str) -> Contribution:
        """Submit a new module for evaluation."""
        contrib_id = hashlib.sha256(
            f"{contributor}:{module.name}:{time.time()}".encode()
        ).hexdigest()[:12]

        contrib = Contribution(
            id=contrib_id,
            contributor=contributor,
            type="module",
            domain=module.domain,
            description=description,
            timestamp=time.time(),
            fingerprint=module.fingerprint(),
        )

        # Save the module weights
        module_path = self.path / "modules" / contrib_id
        module_path.mkdir(parents=True, exist_ok=True)
        torch.save({
            "state_dict": module.state_dict(),
            "meta": module.meta(),
        }, module_path / "module.pt")

        self.contributions.append(contrib)
        self._save()
        return contrib

    def evaluate_module(self, contrib_id: str, mesh: SynthMesh,
                        test_input: torch.Tensor,
                        test_target: torch.Tensor) -> dict:
        """Evaluate a submitted module against the current mesh."""
        contrib = next((c for c in self.contributions if c.id == contrib_id), None)
        if not contrib:
            raise ValueError(f"Contribution {contrib_id} not found")

        # Load the submitted module
        module_path = self.path / "modules" / contrib_id / "module.pt"
        checkpoint = torch.load(module_path, weights_only=False)
        meta = checkpoint["meta"]

        module = SynthModule(
            name=meta["name"],
            domain=meta["domain"],
            dim=meta["dim"],
        )
        module.load_state_dict(checkpoint["state_dict"])
        module.contributor = contrib.contributor

        # Evaluate
        contrib.status = "evaluating"
        result = mesh.evaluate_contribution(module, test_input, test_target)

        contrib.evaluation = result
        if result["accepted"]:
            contrib.status = "accepted"
            contrib.reward_wwwiii = self._calculate_reward(result)
            # Actually integrate the module
            mesh.register_module(module)
        else:
            contrib.status = "rejected"

        self._save()
        return result

    def _calculate_reward(self, evaluation: dict) -> float:
        """Calculate $WWWIII token reward based on improvement magnitude.

        Better contributions = more tokens. Transparent formula.
        """
        improvement = max(0, evaluation["improvement"])
        # Base reward + scaled by improvement
        return 100.0 + (improvement * 10000.0)

    def submit_data(self, contributor: str, domain: str,
                    description: str, data_path: str) -> Contribution:
        """Submit a training dataset."""
        contrib_id = hashlib.sha256(
            f"{contributor}:data:{time.time()}".encode()
        ).hexdigest()[:12]

        contrib = Contribution(
            id=contrib_id,
            contributor=contributor,
            type="data",
            domain=domain,
            description=description,
            timestamp=time.time(),
        )

        self.contributions.append(contrib)
        self._save()
        return contrib

    def submit_compute(self, contributor: str, hours: float,
                       device_info: str) -> Contribution:
        """Log a compute donation."""
        contrib_id = hashlib.sha256(
            f"{contributor}:compute:{time.time()}".encode()
        ).hexdigest()[:12]

        contrib = Contribution(
            id=contrib_id,
            contributor=contributor,
            type="compute",
            domain="training",
            description=f"{hours:.1f}h compute on {device_info}",
            timestamp=time.time(),
            status="accepted",
            reward_wwwiii=hours * 10.0,  # 10 tokens per compute hour
        )

        self.contributions.append(contrib)
        self._save()
        return contrib

    def leaderboard(self) -> list[dict]:
        """Public leaderboard of contributors — transparency always."""
        contributors = {}
        for c in self.contributions:
            if c.contributor not in contributors:
                contributors[c.contributor] = {
                    "contributor": c.contributor,
                    "total_contributions": 0,
                    "accepted": 0,
                    "total_reward": 0.0,
                }
            contributors[c.contributor]["total_contributions"] += 1
            if c.status == "accepted":
                contributors[c.contributor]["accepted"] += 1
            contributors[c.contributor]["total_reward"] += c.reward_wwwiii

        return sorted(contributors.values(), key=lambda x: -x["total_reward"])

    def status(self) -> dict:
        """Full contribution system status."""
        return {
            "total_contributions": len(self.contributions),
            "accepted": sum(1 for c in self.contributions if c.status == "accepted"),
            "rejected": sum(1 for c in self.contributions if c.status == "rejected"),
            "pending": sum(1 for c in self.contributions if c.status == "pending"),
            "total_rewards_distributed": sum(c.reward_wwwiii for c in self.contributions),
            "unique_contributors": len(set(c.contributor for c in self.contributions)),
        }


if __name__ == "__main__":
    from core.mesh import create_genesis_mesh

    print("=== SYNTH Contribution System ===\n")

    mesh = create_genesis_mesh()
    registry = ContributionRegistry("/tmp/synth-contrib-test")

    # Simulate a community contribution
    print("Simulating community module submission...")
    math_module = SynthModule("math-v1", "mathematics", dim=256, depth=3, heads=4)
    math_module.contributor = "alice@contributor"

    contrib = registry.submit_module(
        math_module,
        contributor="alice@contributor",
        description="Specialized math reasoning module with 3-layer transformer"
    )
    print(f"  Submitted: {contrib.id} ({contrib.status})")

    # Evaluate it
    test_input = torch.randn(1, 16, 256)
    test_target = torch.randn(1, 16, 256)
    result = registry.evaluate_module(contrib.id, mesh, test_input, test_target)
    print(f"  Evaluated: {'ACCEPTED' if result['accepted'] else 'REJECTED'}")
    print(f"  Improvement: {result['improvement']:.4f}")

    # Log compute donation
    compute = registry.submit_compute("bob@miner", 24.0, "RTX 4090")
    print(f"\nCompute donation: {compute.description} → {compute.reward_wwwiii} $WWWIII")

    # Show status
    print(f"\n--- System Status ---")
    status = registry.status()
    for k, v in status.items():
        print(f"  {k}: {v}")

    print(f"\n--- Leaderboard ---")
    for entry in registry.leaderboard():
        print(f"  {entry['contributor']}: {entry['accepted']} accepted, {entry['total_reward']:.0f} $WWWIII")

    print("\n✓ Contribution system operational. Anyone can build the model.")
