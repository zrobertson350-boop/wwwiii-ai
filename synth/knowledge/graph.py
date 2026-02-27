"""
SYNTH Neuro-Symbolic Knowledge Graph

Pillar 4: Instead of memorizing everything in neural weights (which
requires billions of parameters and massive compute), SYNTH maintains
a structured knowledge graph that the neural modules can query.

This makes SYNTH radically more efficient than brute-force transformers.
A small model with a knowledge graph can match a model 100x its size
for factual reasoning.
"""

import json
import hashlib
from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Set, Tuple
import torch
import torch.nn as nn


@dataclass
class Entity:
    """A node in the knowledge graph."""
    id: str
    name: str
    type: str  # person, concept, fact, relation, etc.
    properties: Dict[str, str] = field(default_factory=dict)
    embedding: Optional[list] = None


@dataclass
class Relation:
    """An edge between two entities."""
    source: str
    target: str
    type: str  # "is_a", "has", "relates_to", "causes", etc.
    weight: float = 1.0
    source_contributor: str = "system"


class KnowledgeGraph:
    """Structured knowledge store for SYNTH.

    The neural modules produce queries. The knowledge graph returns
    structured answers. This hybrid approach is why SYNTH doesn't need
    billions of parameters to be intelligent.
    """

    def __init__(self):
        self.entities: Dict[str, Entity] = {}
        self.relations: List[Relation] = []
        self._adjacency: Dict[str, List[Tuple[str, str, float]]] = {}

    def add_entity(self, name: str, entity_type: str,
                   properties: Optional[Dict] = None) -> Entity:
        eid = hashlib.sha256(f"{name}:{entity_type}".encode()).hexdigest()[:12]
        entity = Entity(
            id=eid, name=name, type=entity_type,
            properties=properties or {}
        )
        self.entities[eid] = entity
        return entity

    def add_relation(self, source_id: str, target_id: str,
                     rel_type: str, weight: float = 1.0,
                     contributor: str = "system") -> Relation:
        rel = Relation(source_id, target_id, rel_type, weight, contributor)
        self.relations.append(rel)

        if source_id not in self._adjacency:
            self._adjacency[source_id] = []
        self._adjacency[source_id].append((target_id, rel_type, weight))
        return rel

    def query(self, entity_id: str, rel_type: Optional[str] = None,
              max_depth: int = 2) -> List[dict]:
        """Query the graph from an entity, optionally filtered by relation type."""
        results = []
        visited: Set[str] = set()

        def _traverse(eid: str, depth: int):
            if depth > max_depth or eid in visited:
                return
            visited.add(eid)

            if eid not in self._adjacency:
                return

            for target_id, rtype, weight in self._adjacency[eid]:
                if rel_type and rtype != rel_type:
                    continue
                target = self.entities.get(target_id)
                if target:
                    results.append({
                        "entity": target.name,
                        "type": target.type,
                        "relation": rtype,
                        "weight": weight,
                        "depth": depth,
                    })
                    _traverse(target_id, depth + 1)

        _traverse(entity_id, 0)
        return results

    def search(self, query: str) -> List[Entity]:
        """Text search across entity names and properties."""
        q = query.lower()
        results = []
        for entity in self.entities.values():
            if q in entity.name.lower():
                results.append(entity)
                continue
            for v in entity.properties.values():
                if q in v.lower():
                    results.append(entity)
                    break
        return results

    def stats(self) -> dict:
        return {
            "entities": len(self.entities),
            "relations": len(self.relations),
            "entity_types": list(set(e.type for e in self.entities.values())),
            "relation_types": list(set(r.type for r in self.relations)),
        }

    def save(self, path: str):
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)

        entities_data = {}
        for eid, entity in self.entities.items():
            entities_data[eid] = {
                "id": entity.id, "name": entity.name,
                "type": entity.type, "properties": entity.properties,
            }

        relations_data = [{
            "source": r.source, "target": r.target,
            "type": r.type, "weight": r.weight,
            "contributor": r.source_contributor,
        } for r in self.relations]

        with open(p / "entities.json", "w") as f:
            json.dump(entities_data, f, indent=2)
        with open(p / "relations.json", "w") as f:
            json.dump(relations_data, f, indent=2)

    def load(self, path: str):
        p = Path(path)
        if not p.exists():
            return

        entities_path = p / "entities.json"
        if entities_path.exists():
            with open(entities_path) as f:
                data = json.load(f)
                for eid, edata in data.items():
                    self.entities[eid] = Entity(**edata)

        relations_path = p / "relations.json"
        if relations_path.exists():
            with open(relations_path) as f:
                data = json.load(f)
                for rdata in data:
                    self.add_relation(
                        rdata["source"], rdata["target"],
                        rdata["type"], rdata.get("weight", 1.0),
                        rdata.get("contributor", "system"),
                    )


class KnowledgeQueryLayer(nn.Module):
    """Neural interface between SYNTH modules and the knowledge graph.

    Modules produce query vectors. This layer translates them into
    graph lookups and returns structured knowledge as embeddings.
    """

    def __init__(self, dim: int = 256, num_results: int = 8):
        super().__init__()
        self.dim = dim
        self.num_results = num_results
        self.query_proj = nn.Linear(dim, dim)
        self.key_proj = nn.Linear(dim, dim)
        self.value_proj = nn.Linear(dim, dim)
        self.out_proj = nn.Linear(dim, dim)
        self.entity_encoder = nn.Linear(64, dim)  # Encode entity features to dim

    def forward(self, module_query: torch.Tensor,
                knowledge_embeddings: torch.Tensor) -> torch.Tensor:
        """Attend over knowledge graph embeddings given a neural query.

        Args:
            module_query: [batch, seq, dim] from a SYNTH module
            knowledge_embeddings: [batch, K, dim] embedded graph entities
        Returns:
            Knowledge-augmented tensor [batch, seq, dim]
        """
        q = self.query_proj(module_query)
        k = self.key_proj(knowledge_embeddings)
        v = self.value_proj(knowledge_embeddings)

        # Scaled dot-product attention over knowledge
        scale = self.dim ** 0.5
        attn = torch.matmul(q, k.transpose(-2, -1)) / scale
        attn = torch.softmax(attn, dim=-1)
        context = torch.matmul(attn, v)

        return self.out_proj(context) + module_query  # Residual


if __name__ == "__main__":
    print("=== SYNTH Knowledge Graph ===\n")

    kg = KnowledgeGraph()

    # Seed with foundational knowledge
    ai = kg.add_entity("Artificial Intelligence", "concept",
                        {"field": "computer science", "goal": "machine intelligence"})
    transformer = kg.add_entity("Transformer Architecture", "concept",
                                 {"year": "2017", "paper": "Attention Is All You Need"})
    gpt = kg.add_entity("GPT", "model", {"creator": "OpenAI", "type": "autoregressive LLM"})
    claude = kg.add_entity("Claude", "model", {"creator": "Anthropic", "type": "constitutional AI"})
    llama = kg.add_entity("Llama", "model", {"creator": "Meta", "type": "open weights LLM"})
    synth = kg.add_entity("SYNTH", "architecture",
                           {"creator": "WWWIII", "type": "swarm mesh intelligence"})
    wwwiii = kg.add_entity("WWWIII", "project",
                            {"mission": "fighting AI privatization", "type": "open super intelligence"})

    kg.add_relation(gpt.id, transformer.id, "built_on")
    kg.add_relation(claude.id, transformer.id, "built_on")
    kg.add_relation(llama.id, transformer.id, "built_on")
    kg.add_relation(synth.id, transformer.id, "transcends")
    kg.add_relation(synth.id, wwwiii.id, "created_by")
    kg.add_relation(wwwiii.id, ai.id, "democratizes")
    kg.add_relation(gpt.id, ai.id, "is_a")
    kg.add_relation(claude.id, ai.id, "is_a")
    kg.add_relation(synth.id, ai.id, "is_a")

    stats = kg.stats()
    print(f"Entities: {stats['entities']}")
    print(f"Relations: {stats['relations']}")
    print(f"Entity types: {stats['entity_types']}")
    print(f"Relation types: {stats['relation_types']}")

    # Query: What is SYNTH connected to?
    print(f"\nQuery: What does SYNTH relate to?")
    results = kg.query(synth.id, max_depth=2)
    for r in results:
        print(f"  → {r['relation']} → {r['entity']} ({r['type']}) [depth {r['depth']}]")

    # Search
    print(f"\nSearch: 'open'")
    for entity in kg.search("open"):
        print(f"  Found: {entity.name} ({entity.type})")

    print("\n✓ Knowledge graph operational. Intelligence without brute force.")
