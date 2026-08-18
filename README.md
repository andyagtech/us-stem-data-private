# PhD Demographics — Private Components

This repo contains site generation, deployment, and classification components
that are not included in the public methodology repo.

## Setup

```bash
# Clone both repos side by side
git clone <public-repo-url> usds_china
git clone <private-repo-url> usds_china_private

# Link private files into public repo
cd usds_china_private
./link.sh
```

After linking, `usds_china/` has the full development environment with all
7 pipeline steps.

## What's Here

```
site/                    # Generated HTML, static assets
scripts/
  generate_name_lists_html.py   # HTML/JS page generator
  name_classifier.py            # Surname-based origin classifier
  classify_*.py                 # Classification analysis scripts
  build_dashboard.py            # Dashboard page builder
  generate_dashboard_data.py    # Dashboard data builder
pipeline/
  step5_generate.py             # HTML generation step
  step6_deploy.py               # S3 + CloudFront deployment
  manifest.json                 # Pipeline execution state
  ai_classifications.json       # AI classification cache
  degree_classifier.pkl         # Trained sklearn model
infra/
  analytics_lambda.py           # Analytics Lambda function
  chat/                         # Chat assistant Lambda + admin
  contact/                      # Tip-line contact form Lambda (SES)
plans/                   # Historical planning documents
```

## Deploy

```bash
cd ../usds_china
python -m pipeline run --step generate,build_pages,deploy
```

## Unlink

```bash
cd usds_china_private
./link.sh --unlink
```
