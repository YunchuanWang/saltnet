# SaltNet construction pipeline

Turn the biomedical literature into an **evidence-linked knowledge graph and gene
functional database** with a multi-agent LLM pipeline. This is the machinery that
builds [SaltNet](https://supermanwasd.github.io/saltnet/) (plant salt-tolerance
genes) — but it is topic-agnostic: give it your own PubMed query and it builds an
analogous resource for any subject.

Every annotation and every edge is kept only when supported by explicit text and is
traceable to its PubMed IDs and verbatim evidence.

---

## How it works — two tiers

```
Tier A  (LLM, expensive, per-PMID resumable)      Tier B (deterministic, cheap)
  search  keyword -> PMID -> abstracts               consolidate -> master data
  filter  embed -> cluster -> keep on-topic          build -> db + KG json + tables + figures
  extract two independent models -> genes/edges      check -> verify numbers
  arbitrate  full-text arbitration of disagreements
  audit   per-field re-checks
```

Two coordinated outputs: a **gene functional dataset** and a **knowledge graph** of
genes, pathways and typed relationships. Full stage-by-stage map: see
[`PIPELINE_STAGES.md`](PIPELINE_STAGES.md).

---

## Prerequisites

| Software | Why | Needed by |
|---|---|---|
| **Python ≥3.10 + data stack** | embedding / clustering / graph / MCP | all |
| **NCBI EDirect** (`esearch`/`efetch`) | PubMed search + download | `search` |
| **GNU make** | orchestration | all |
| **Claude Code CLI** (logged in, with quota) | the LLM stages | `extract`, `arbitrate`, `audit` |

Only `extract`/`arbitrate`/`audit` call the LLM (cost money). `search`, `filter`,
`check` and `build` run **without** any LLM.

## Install

```bash
# Python env + EDirect in one go (environment.yml includes entrez-direct):
conda env create -f environment.yml && conda activate saltnet
#   ...or with pip (install EDirect separately):
#   pip install -r requirements.txt

# Claude Code CLI (only for the LLM stages): https://claude.com/claude-code
```

---

## Run it — two ways

### A) Command line (Makefile)

```bash
make help          # list all targets

# build a resource for your own topic:
make search QUERY='("cold stress"[TIAB]) AND plants[MeSH]' MINDATE=2000 MAXDATE=2026
make filter
make extract       # LLM; dual-model
make arbitrate     # LLM
make audit         # LLM
make consolidate   # merge -> master data files
make build         # db + KG json + tables + figures
make check         # verify numbers against the data
```

`make build` is incremental: change the master data and it rebuilds only what is
downstream. Override the interpreter if the env is not activated:
`make build PY=/path/to/env/bin/python`.

### B) Conversationally (MCP server)

The same stages are exposed as agent-callable MCP tools (`search_abstracts`,
`filter_corpus`, `extract`, `arbitrate`, `audit`, `check`, `build_kg_db`, plus
`get_job`/`list_jobs`). Heavy LLM stages run as background jobs with a cost
guardrail. See [`mcp_pipeline/README.md`](mcp_pipeline/README.md) for tools and
client registration.

```bash
python mcp_pipeline/pipeline_mcp.py     # stdio MCP server
```

---

## Make targets

| Target | Tier | Does |
|---|---|---|
| `search` | A | esearch → fetch abstracts → parse |
| `filter` | A | SPECTER2 embed → HDBSCAN cluster → KeyBERT → topic filter |
| `extract` | A | dual-model extraction (genes, annotations, KG triples) |
| `arbitrate` | A | adjudicate + full-text arbitration of single-model edges |
| `audit` | A | per-field Opus audits |
| `consolidate` | A→B | merge per-paper outputs → master CSV + KG parquet |
| `build` | B | `db` + `kg` + `tables` + `supp` + `figures` |
| `check` | B | recompute canonical numbers + scan manuscript for stale ones |

---

## Notes

- **LLM cost**: extraction runs `claude -p` per paper for two models; expect real
  cost/time on large corpora. The MCP `extract` tool returns a cost estimate before
  running. LLM loops are resumable and quota-aware (sleep-and-retry).
- **`make db` / `make kg`** write into the web project
  (`WEB ?= ../../final_table/salt_gene_db`); set/adjust `WEB` for your own site, or
  skip these two targets if you only need the data files, tables and figures.
- **Resumability**: per-PMID stages skip papers whose output already exists, so an
  interrupted run resumes where it stopped.
- This pipeline **builds** the resource. A separate MCP server
  (`final_table/saltnet/mcp_server/`) **serves** the finished database
  (search_genes / get_gene / get_gene_network).

## Layout

```
README.md              this file
Makefile               orchestration (Tier A + Tier B)
requirements.txt       pip dependencies
environment.yml        conda env (recommended; includes EDirect)
PIPELINE_STAGES.md     stage -> script -> I/O map
check_numbers.py       numbers guard (make check)
00a_esearch.sh         keyword -> PMID entry point
00..20_*.{py,sh}       pipeline stages
loop_*.sh              quota-aware LLM loop wrappers
_kg_*.py _make_*.py _fig_*.py   knowledge-graph / table / figure builders
mcp_pipeline/          MCP server exposing the pipeline as agent tools
```
