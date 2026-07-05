# SaltNet pipeline MCP server

Exposes the literature → knowledge-base pipeline as agent-callable tools, one per
stage, wrapping the `Makefile`. Turns "build a SaltNet-style resource for your own
topic" into a conversation: an agent (or you) drives search → filter → extract →
arbitrate → audit → check → build with your own keywords and chosen models.

## Tools

| Tool | Kind | What it does |
|---|---|---|
| `search_abstracts(query, mindate, maxdate)` | async job | PubMed search by your keywords → download abstracts → parse |
| `filter_corpus()` | async job | KeyBERT keywords → cluster (SPECTER2 + HDBSCAN) → keyword-based topic filter |
| `extract(model_a, model_b, confirm)` | async job | dual-model extraction (genes, annotations, KG triples); `confirm=False` returns a cost estimate |
| `arbitrate(model, confirm)` | async job | adjudicate disagreements + arbitrate single-model KG edges on full text |
| `audit()` | async job | per-field Opus audits (substrate, category, species, role) |
| `check()` | sync | recompute canonical numbers + scan manuscript for stale numbers |
| `build_kg_db(target)` | sync | rebuild db + KG json + tables + figures from the master data |
| `get_job(job_id)` / `list_jobs()` / `stop_job(job_id)` | sync | manage background jobs |

Heavy LLM stages run as **background jobs** (return `job_id`; poll with `get_job`),
so the tool call never blocks for hours. Light stages run synchronously.

## Prerequisites (software to install)

| Software | Why | Needed by | Install |
|---|---|---|---|
| **Python ≥3.10 + data stack** | embedding / clustering / graph / MCP | all tools | `conda env create -f ../environment.yml` (recommended) or `pip install -r ../requirements.txt` |
| **`mcp` package** | the MCP server itself | all tools | included in the env files |
| **NCBI EDirect** (`esearch`/`efetch`) | PubMed search + download | `search_abstracts` | `conda install -c bioconda entrez-direct` (or the EDirect install script) |
| **GNU make** | the server wraps `make` targets | all tools | preinstalled on most Linux/macOS |
| **Claude Code CLI** (logged in, with quota) | runs the LLM stages | `extract`, `arbitrate`, `audit` | https://claude.com/claude-code |
| **An MCP client** | connects to this server | — | Claude Desktop / Claude Code / any MCP client |
| Network access | PubMed / PMC / Unpaywall | search + full-text download | — |

**Which tools need the Claude Code CLI (LLM):** only `extract`, `arbitrate`, `audit`
call the LLM (they cost money/quota). `search_abstracts`, `filter_corpus`, `check`
and `build_kg_db` run **without** any LLM once the Python env and EDirect are installed.

### Quick install (3 steps)
```bash
# 1. Python env + EDirect (one conda command; environment.yml includes entrez-direct)
conda env create -f ../environment.yml && conda activate saltnet
# 2. Install & log in to the Claude Code CLI  (needed for the LLM stages)
#    https://claude.com/claude-code
# 3. Register this server in your MCP client (see "Register" below)
```
Dependency files: `../requirements.txt` (pip) and `../environment.yml` (conda).

## Run
```
/home/wangy1j/miniconda3/envs/salt_nlp/bin/python pipeline_mcp.py
```

## Register with an MCP client (stdio)
Example `mcpServers` entry:
```json
{
  "mcpServers": {
    "saltnet-pipeline": {
      "command": "/home/wangy1j/miniconda3/envs/salt_nlp/bin/python",
      "args": ["/home/wangy1j/script_result/jupyter/AI_paper/all_keys_abstract/pipeline/mcp_pipeline/pipeline_mcp.py"]
    }
  }
}
```

## Typical agent flow
1. `search_abstracts(query='("cold stress"[TIAB]) AND plants[MeSH]', mindate='2000')`
2. `get_job(...)` until completed
3. `filter_corpus()` → poll
4. `extract(model_a='sonnet', model_b='opus', confirm=False)` → review cost → `confirm=True`
5. `arbitrate(confirm=True)` → `audit()` → poll
6. `build_kg_db('build')` then `check()`

Note: this is separate from the **query** MCP server
(`final_table/saltnet/mcp_server/saltnet_mcp.py`), which serves the finished
database (search_genes/get_gene/get_gene_network). This one *builds* the resource.
