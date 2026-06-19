---
applyTo: "**/Dockerfile,**/Dockerfile.*,**/*.dockerfile,**/docker-compose*.yml,**/docker-compose*.yaml,**/helm/**,**/charts/**,**/values*.yaml,**/values*.yml,**/*.tf,**/*.tfvars,**/cdk/**,**/*.cdk.ts,**/cdk.json,.github/workflows/**"
---

# Infrastructure Review Rules

If `[light-ccr]` mode is active per `../copilot-instructions.md`, do not apply this file.

## Secrets and credentials

- **Secret values in YAML/HCL/Dockerfile** — literal API keys, passwords, tokens, connection strings with credentials, private keys. Critical.
- **Plaintext secrets in `values.yaml`** instead of SecretRef, ExternalSecret, or sealed-secret.
- **Hardcoded AWS account IDs, ARNs with embedded secrets, or credentials in image envs.**
- **`.env` files with real values committed.** `.env.example` is fine.

## Dockerfile hygiene

- Single-stage Dockerfile producing a runtime image that contains build tools or test deps. Use multi-stage.
- Base image without a pinned tag (`:latest`, missing tag).
- `ADD` where `COPY` would suffice (ADD has remote-fetch and tar-extraction surprises).
- `RUN apt-get install` without `apt-get update &&` in the same layer (cache poisoning).
- `RUN apt-get install` without `--no-install-recommends` and without cleanup.
- Missing or wrong `USER` — final stage running as root.
- `chmod 777` or world-writable paths.
- `COPY . .` without a `.dockerignore` excluding `.git`, `node_modules`, secrets.

## Helm / Kubernetes

- New Deployment without resource `requests` and `limits`.
- New Deployment without `livenessProbe` and `readinessProbe`.
- **Liveness probe checking external dependencies** (DB, Kafka). Don't — restart cascades.
- **Readiness probe missing checks for genuine external deps** the service can't function without.
- **Probes monitoring RAM, CPU, or downstream services** — k8s handles RAM/CPU; cross-service readiness checks cause cascading outages.
- New ConfigMap/Secret referenced but not defined in the same chart, with no comment.
- `imagePullPolicy: Always` on a pinned tag, or `IfNotPresent` on `:latest`.
- New Service without explicit `type`.
- Privileged containers, `hostNetwork: true`, `hostPath` mounts without justifying comment.

## Terraform / CDK

- New resources without tags (project, environment, owner) when surrounding resources are tagged.
- IAM with `Action: "*"` or `Resource: "*"` on new policies.
- Public S3 buckets, public security groups (`0.0.0.0/0` ingress on non-HTTP ports), public RDS — flag unless an explicit comment justifies.
- New resources without `prevent_destroy` lifecycle when surrounding production resources have it.
- Hardcoded region, account ID, or environment names that should be variables.

## GitHub Actions workflows

- **Pipelines that build but never run tests.** `mvn package -DskipTests`, `npm run build` with no test step, `pytest --collect-only`.
- **Tests that always pass.** `|| true` appended to test commands. `continue-on-error: true` on the test step.
- **Lockfile-respecting install commands.** Use `npm ci` not `npm install`; `pip install --require-hashes` or equivalent when a lockfile exists.
- **Secrets in workflow files** instead of `${{ secrets.NAME }}`.
- **Third-party actions pinned to a tag (`@v3`)** instead of a SHA. Tags can be moved.
- **`pull_request_target` with `actions/checkout` of the PR head** — supply chain risk.
- **`GITHUB_TOKEN` permissions defaulting to write** when the job only needs read.

## Supply chain

- New SNAPSHOT/mutable artifact references in a production-bound build.
- New Dependabot config gaps — diff that adds a new package ecosystem (e.g. first time `package.json` appears) without a corresponding `.github/dependabot.yml` update.

## Code health

- Duplicated YAML across charts/environments that should be templated.
- Magic numbers (timeouts, replicas, ports) without explanatory comments.
- Commented-out resources or steps left in the file.
