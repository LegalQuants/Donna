# syntax=docker/dockerfile:1
# Donna-published wrapper over the lq-ai `api` image. Bakes the skills corpus
# (vendor/lq-ai/skills, the nested lq-skills submodule) into the image so the
# api / ingest-worker / arq-worker need no `./skills` bind mount — without
# editing vendor/lq-ai. Build context MUST be vendor/lq-ai/ so `skills/`
# resolves. BASE is the lq-ai api image (built first; see release.yml).
ARG BASE
FROM ${BASE}
COPY skills /skills
ENV LQ_AI_SKILLS_DIR=/skills
