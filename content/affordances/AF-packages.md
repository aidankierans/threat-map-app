---
id: AF-packages
label: Package installation from an internal registry
tag: packages
cites:
  - metr-huggingface-investigation
status: draft
provenance: ai-drafted
needs_citation: false
layer: affordance
evidence_bucket: assessment
enabled_by:
  - all:
      - CMP-artifact-registries
      - S-devevals
    note: Sandboxed evaluation agents fetch dependencies from a registry the
      developer operates. The grant is read access to packages, not a channel to
      other instances.
---

Evaluation agents could fetch dependencies from an internal package registry. This legitimate access did not authorize modifying the service or communicating with other agents. [@metr-huggingface-investigation]
