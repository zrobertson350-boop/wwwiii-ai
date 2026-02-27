"""
SYNTH Confluence Engine — Pillar 5

The piece no one has built.

The Confluence Engine is a living system that autonomously integrates
human contributions into the model. Not a Git repo people PR into.
A system that DIGESTS contributions and self-improves.

Think of it as the model's metabolism:
- Contributions come in (modules, data, architectures)
- The engine evaluates them against the current mesh
- Good contributions get integrated, weighted by impact
- Bad contributions get rejected (immune system)
- The model evolves continuously, shaped by collective human intelligence

This is what makes WWWIII different from every AI project on earth.
Corporate models are static snapshots trained once. SYNTH is alive —
it grows with every contribution from the community.
"""

import torch
import torch.nn as nn
import time
import json
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional
from collections import deque

import sys
sys.path.insert(0, str(Path(__file__).parent.parent))
from core.mesh import SynthMesh, SynthModule, SynchronicityLayer


@dataclass
class EvolutionEvent:
    """A record of the mesh evolving."""
    timestamp: float
    event_type: str  # "module_added", "module_removed", "architecture_evolved", "merge"
    description: str
    contributor: str
    delta_params: int
    delta_loss: float
    mesh_snapshot: dict


class ConfluenceEngine:
    """The living heart of SYNTH.

    Manages the continuous evolution of the mesh through:
    1. Module integration — new specialist modules from contributors
    2. Architecture evolution — the mesh proposes and tests new structures
    3. Knowledge assimilation — new data gets absorbed into the graph
    4. Self-pruning — underperforming modules get removed
    5. Synchronicity tuning — the fusion layer adapts as modules change
    """

    def __init__(self, mesh: SynthMesh, history_size: int = 1000):
        self.mesh = mesh
        self.history: deque[EvolutionEvent] = deque(maxlen=history_size)
        self.generation = 0
        self.best_loss = float("inf")
        self.total_contributions_processed = 0

    def integrate_module(self, module: SynthModule,
                         test_input: torch.Tensor,
                         test_target: torch.Tensor) -> dict:
        """Try to integrate a new module into the mesh.

        The immune system: only modules that improve the mesh survive.
        """
        self.total_contributions_processed += 1

        result = self.mesh.evaluate_contribution(module, test_input, test_target)

        if result["accepted"]:
            # Actually add it to the mesh
            self.mesh.register_module(module)
            self.generation += 1

            if result["candidate_loss"] < self.best_loss:
                self.best_loss = result["candidate_loss"]

            event = EvolutionEvent(
                timestamp=time.time(),
                event_type="module_added",
                description=f"Module '{module.name}' ({module.domain}) integrated",
                contributor=module.contributor or "anonymous",
                delta_params=sum(p.numel() for p in module.parameters()),
                delta_loss=result["improvement"],
                mesh_snapshot=self.mesh.status(),
            )
            self.history.append(event)

        return {
            **result,
            "generation": self.generation,
            "mesh_modules": len(self.mesh.modules),
        }

    def self_prune(self, test_input: torch.Tensor,
                   test_target: torch.Tensor) -> List[str]:
        """Remove modules that no longer contribute to mesh performance.

        The model cleans itself. No dead weight.
        """
        if len(self.mesh.modules) <= 1:
            return []

        pruned = []

        # Test each module's contribution by removing it temporarily
        module_scores = {}
        baseline_out = self.mesh.forward(test_input)
        baseline_loss = nn.functional.mse_loss(baseline_out, test_target).item()

        for name in list(self.mesh.modules.keys()):
            module = self.mesh.modules[name]
            self.mesh.remove_module(name)

            with torch.no_grad():
                without_out = self.mesh.forward(test_input)
                without_loss = nn.functional.mse_loss(without_out, test_target).item()

            # Restore module
            self.mesh.register_module(module)

            # If removing it IMPROVES the mesh, the module is harmful
            module_scores[name] = baseline_loss - without_loss  # positive = module helps

        # Prune modules that hurt performance
        for name, score in module_scores.items():
            if score < -0.001:  # Module is actively harmful
                self.mesh.remove_module(name)
                pruned.append(name)
                self.generation += 1

                event = EvolutionEvent(
                    timestamp=time.time(),
                    event_type="module_removed",
                    description=f"Module '{name}' pruned (score: {score:.4f})",
                    contributor="confluence-engine",
                    delta_params=0,
                    delta_loss=abs(score),
                    mesh_snapshot=self.mesh.status(),
                )
                self.history.append(event)

        return pruned

    def evolve_architecture(self, test_input: torch.Tensor,
                            test_target: torch.Tensor,
                            candidates: int = 5) -> dict:
        """The self-architecting piece.

        Generate random architectural variations of existing modules,
        test them, keep the best. The model designs itself.
        """
        best_candidate = None
        best_improvement = 0

        for i in range(candidates):
            # Pick a random existing module as template
            template_name = list(self.mesh.modules.keys())[i % len(self.mesh.modules)]
            template = self.mesh.modules[template_name]

            # Create variation — different depth
            new_depth = max(1, template.layers.__len__() + torch.randint(-1, 2, (1,)).item())
            candidate = SynthModule(
                name=f"evolved-{template.domain}-g{self.generation}-{i}",
                domain=template.domain,
                dim=template.dim,
                depth=new_depth,
                heads=4,
            )
            candidate.contributor = "confluence-evolution"

            result = self.mesh.evaluate_contribution(candidate, test_input, test_target)
            if result["accepted"] and result["improvement"] > best_improvement:
                best_candidate = candidate
                best_improvement = result["improvement"]

        if best_candidate:
            self.mesh.register_module(best_candidate)
            self.generation += 1

            event = EvolutionEvent(
                timestamp=time.time(),
                event_type="architecture_evolved",
                description=f"Self-evolved module '{best_candidate.name}'",
                contributor="confluence-evolution",
                delta_params=sum(p.numel() for p in best_candidate.parameters()),
                delta_loss=best_improvement,
                mesh_snapshot=self.mesh.status(),
            )
            self.history.append(event)

            return {
                "evolved": True,
                "module": best_candidate.name,
                "improvement": best_improvement,
                "generation": self.generation,
            }

        return {"evolved": False, "generation": self.generation}

    def pulse(self) -> dict:
        """The mesh's heartbeat — full transparent status."""
        return {
            "generation": self.generation,
            "best_loss": self.best_loss,
            "total_contributions": self.total_contributions_processed,
            "mesh": self.mesh.status(),
            "recent_events": [
                {
                    "type": e.event_type,
                    "description": e.description,
                    "contributor": e.contributor,
                    "time": e.timestamp,
                }
                for e in list(self.history)[-10:]
            ],
        }


if __name__ == "__main__":
    from core.mesh import create_genesis_mesh

    print("=== SYNTH Confluence Engine ===")
    print("The living intelligence system.\n")

    mesh = create_genesis_mesh()
    engine = ConfluenceEngine(mesh)

    test_input = torch.randn(2, 16, 256)
    test_target = torch.randn(2, 16, 256)

    # Phase 1: Community contributions
    print("--- Community Contributions ---")
    for i, domain in enumerate(["mathematics", "code", "science", "philosophy"]):
        module = SynthModule(f"{domain}-v1", domain, dim=256, depth=3, heads=4)
        module.contributor = f"contributor-{i:03d}"

        result = engine.integrate_module(module, test_input, test_target)
        status = "INTEGRATED" if result["accepted"] else "REJECTED"
        print(f"  [{status}] {module.name} by {module.contributor} "
              f"(improvement: {result['improvement']:+.4f})")

    # Phase 2: Self-evolution
    print("\n--- Self-Evolution ---")
    evo = engine.evolve_architecture(test_input, test_target, candidates=8)
    if evo["evolved"]:
        print(f"  Evolved: {evo['module']} (improvement: {evo['improvement']:+.4f})")
    else:
        print("  No improvement found this cycle.")

    # Phase 3: Self-pruning
    print("\n--- Self-Pruning ---")
    pruned = engine.self_prune(test_input, test_target)
    if pruned:
        print(f"  Pruned {len(pruned)} underperforming modules: {pruned}")
    else:
        print("  All modules contributing positively.")

    # Heartbeat
    print("\n--- Pulse ---")
    pulse = engine.pulse()
    print(f"  Generation: {pulse['generation']}")
    print(f"  Best loss: {pulse['best_loss']:.4f}")
    print(f"  Contributions processed: {pulse['total_contributions']}")
    print(f"  Active modules: {pulse['mesh']['total_modules']}")
    print(f"  Total parameters: {pulse['mesh']['total_params']:,}")

    print("\n  Recent events:")
    for e in pulse["recent_events"][-5:]:
        print(f"    [{e['type']}] {e['description']}")

    print("\n✓ Confluence Engine operational.")
    print("  The model is alive. It grows with every contribution.")
    print("  No corporation can build this. Only the people can.")
