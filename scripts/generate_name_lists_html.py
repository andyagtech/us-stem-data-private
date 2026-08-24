#!/usr/bin/env python3
"""
Generate an HTML page with clickable name lists for all high-NRA universities.
Each name links directly to the institutional repository for verification.
Flag icons mark identified origins: Chinese, Indian, Iranian, Korean, Vietnamese, Turkish, Arabic.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from name_classifier import classify  # noqa: F401

# Deployment configuration — override via environment variables
SITE_DOMAIN = os.environ.get('SITE_DOMAIN', 'https://phd-demographics.andy-barr.com')

# This file is symlinked into the main checkout, so __file__ can resolve either
# side of the link. Look for the og/ helper package next to both before giving up.
for _cand in (os.path.dirname(os.path.abspath(__file__)),
              os.path.dirname(os.path.realpath(__file__))):
    if os.path.isfile(os.path.join(_cand, 'og', 'tags.py')):
        sys.path.insert(0, _cand)
        break
else:
    raise ImportError(
        "scripts/og/tags.py not found next to generate_name_lists_html.py; "
        "run this from the checkout that contains scripts/og/")
from og import tags as og_tags
ANALYTICS_ENDPOINT = os.environ.get('ANALYTICS_ENDPOINT', 'https://analytics.andy-barr.com/collect')

from generate_name_lists import (
    CONFIGS, load_records, merge_university_records,
)

# Origin config: key -> (flag_html, label, css_class)
# Arabic language flag uses the user's custom SVG file
ARABIC_FLAG_HTML = '<img src="arabic_language_flag.svg" class="arabic-flag-img" alt="Arabic">'

ORIGINS = {
    'chinese':    ('\U0001F1E8\U0001F1F3', 'Chinese',    'flag-cn'),
    'indian':     ('\U0001F1EE\U0001F1F3', 'Indian',     'flag-in'),
    'iranian':    ('\U0001F1EE\U0001F1F7', 'Iranian',    'flag-ir'),
    'korean':     ('\U0001F1F0\U0001F1F7', 'Korean',     'flag-kr'),
    'vietnamese': ('\U0001F1FB\U0001F1F3', 'Vietnamese', 'flag-vn'),
    'turkish':    ('\U0001F1F9\U0001F1F7', 'Turkish',    'flag-tr'),
    'arabic':     (ARABIC_FLAG_HTML,        'Arabic',     'flag-ar'),
}

def classification_badge(cat, conf):
    if cat not in ORIGINS:
        return ''
    flag, label, css_class = ORIGINS[cat]
    return f'<span class="flag-badge {css_class}" data-origin="{cat}" title="{label}">{flag}</span>'


def build_html(all_data, mode='stem'):
    """Build an HTML page with JSON data blob and client-side rendering.
    Only renders one university at a time for performance.
    mode: 'stem' or 'non-stem'"""
    import json
    is_nonstem = mode == 'non-stem'

    # Build lightweight index (no records — those are fetched on demand)
    all_data_sorted = sorted(all_data, key=lambda x: x[2], reverse=True)
    data_dir = 'data/nonstem' if is_nonstem else 'data/stem'

    index_unis = []
    nav_items = []
    for uni_key, uni_name, nra, records in all_data_sorted:
        index_unis.append({
            'key': uni_key, 'name': uni_name, 'nra': nra,
            'count': len(records),
        })
        nav_items.append(
            f'<a href="javascript:void(0)" class="nav-item" data-key="{uni_key}" onclick="showUni(\'{uni_key}\');">'
            f'<span>{uni_name}</span>'
            f'<span><span class="nav-nra">{nra}%</span><span class="opt-dot"></span></span></a>'
        )

    data_json = json.dumps(index_unis, ensure_ascii=False, separators=(',', ':'))

    # Build legend key
    legend_key_items = []
    for o, (flag, label, css_class) in ORIGINS.items():
        legend_key_items.append(f'<span class="legend-key-item">{flag} {label}</span>')

    # Origin keys for JS
    origins_js = json.dumps({k: [v[0], v[1]] for k, v in ORIGINS.items()}, ensure_ascii=False)

    # Load funding data
    funding_path = os.path.join(os.path.dirname(__file__), '..', 'data', 'herd', 'funding_by_university.json')
    funding_json = '{}'
    if os.path.exists(funding_path):
        with open(funding_path) as f:
            funding_json = f.read().strip()

    # OpenGraph / Twitter block pointing at this page's own data-driven share
    # card (og/stem.png or og/non_stem.png). Built by scripts/og/tags.py so the
    # strings match scripts/build_og_cards.py exactly.
    og_block = og_tags.generated_page_block('non_stem' if is_nonstem else 'stem')

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="Tracking the outputs of American Academia. Taxpayer-funded institutions should graduate Americans. Thesis and dissertation data from 101 US research universities, enriched with government data.">
{og_block}
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<title>{"Non-STEM " if is_nonstem else ""}Thesis &amp; Dissertation Lists — High NRA Universities</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<style>
  :root {{
    --bg: #0f172a; --surface: #1e293b; --surface2: #334155;
    --text: #e2e8f0; --text-muted: #94a3b8; --accent: #38bdf8;
    --red: #f87171; --orange: #fb923c; --yellow: #fbbf24;
    --green: #4ade80; --blue: #60a5fa;
  }}
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); display: flex; min-height: 100vh; }}

  .sidebar {{ width: 220px; background: var(--surface); border-right: 1px solid var(--surface2); padding: 16px 0; position: fixed; top: 0; left: 0; bottom: 0; overflow-y: auto; z-index: 20; }}
  /* Share anchor buttons */
  .share-anchor {{ font-size: 0.72rem; font-weight: 700; line-height: 1; cursor: pointer; text-decoration: none; color: var(--accent); padding: 2px 4px; border-radius: 3px; opacity: 0.32; transition: opacity 0.15s; user-select: none; }}
  .share-anchor:hover, .share-anchor:focus-visible {{ opacity: 1; }}
  .dept-header .share-anchor {{ margin-left: auto; }}
  .nat-chart-box h3 .share-anchor, .funding-chart-wrap h3 .share-anchor, #content h2 .share-anchor {{ margin-left: 6px; }}
  /* Anchor targets: leave room under any fixed chrome and flash on arrival */
  [id] {{ scroll-margin-top: 16px; }}
  .anchor-alias {{ display: block; height: 0; overflow: hidden; }}
  .nat-chart-box:target, .funding-chart-wrap:target, .dept-section:target, .year-block:target,
  .anchor-flash {{ outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 6px; }}
  .anchor-flash {{ animation: anchorFade 2.4s ease-out forwards; }}
  @keyframes anchorFade {{ 0%, 55% {{ outline-color: var(--accent); }} 100% {{ outline-color: transparent; }} }}
  /* Accessibility: focus indicators */
  a:focus-visible, button:focus-visible, select:focus-visible {{ outline: 2px solid var(--accent); outline-offset: 2px; }}
  .nav-item:focus-visible {{ outline: 2px solid var(--accent); outline-offset: -2px; }}
  .sidebar h3 {{ padding: 0 16px 12px; font-size: 0.85rem; color: var(--accent); }}
  .nav-item {{ display: flex; justify-content: space-between; align-items: baseline; padding: 8px 16px; color: var(--text-muted); text-decoration: none; font-size: 0.85rem; border-left: 3px solid transparent; transition: all 0.1s; }}
  .nav-item:hover {{ background: var(--surface2); color: var(--text); }}
  .nav-item.active {{ border-left-color: var(--accent); color: var(--accent); background: rgba(56,189,248,0.08); }}
  .nav-nra {{ font-size: 0.7rem; color: var(--text-muted); }}
  .opt-dot {{ display: none; width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-left: 5px; vertical-align: middle; }}
  .h1b-active .nav-item.has-opt .opt-dot {{ display: inline-block; }}
  .sidebar-section {{ padding: 12px 16px 5px; font-size: 0.68rem; font-weight: 700; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; cursor: pointer; display: flex; align-items: center; gap: 6px; user-select: none; }}
  .sidebar-section:hover {{ color: #7dd3fc; }}
  .sidebar-section .chevron {{ font-size: 0.55rem; transition: transform 0.15s; color: var(--surface2); }}
  .sidebar-group.collapsed .sidebar-section .chevron {{ transform: rotate(-90deg); }}
  .sidebar-group.collapsed .sidebar-group-content {{ display: none; }}
  .nav-page {{ font-size: 0.82rem; padding: 6px 16px; }}

  .main {{ margin-left: 220px; flex: 1; padding: 24px 32px; max-width: 1200px; }}
  h1 {{ font-size: 1.4rem; margin-bottom: 4px; }}
  .subtitle {{ color: var(--text-muted); font-size: 0.85rem; margin-bottom: 12px; }}
  h2 {{ font-size: 1.2rem; margin-bottom: 4px; }}
  .uni-nra {{ font-size: 0.85rem; color: var(--accent); font-weight: 400; }}
  .uni-stats {{ font-size: 0.85rem; color: var(--text-muted); margin-bottom: 16px; }}

  .toggle-bar {{ display: flex; align-items: center; justify-content: space-around; gap: 8px; padding: 10px 16px; background: var(--surface); border-radius: 10px; border: 1px solid var(--surface2); margin-bottom: 16px; flex-wrap: wrap; }}
  .toggle-wrap {{ display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none; flex: 1; min-width: 160px; justify-content: center; }}
  .toggle-label {{ font-size: 0.82rem; font-weight: 600; color: var(--text); }}
  .toggle-switch {{ position: relative; width: 40px; height: 22px; background: var(--surface2); border-radius: 11px; transition: background 0.2s; flex-shrink: 0; }}
  .toggle-switch::after {{ content: ''; position: absolute; top: 3px; left: 3px; width: 16px; height: 16px; background: var(--text-muted); border-radius: 50%; transition: all 0.2s; }}
  .toggle-wrap.active .toggle-switch {{ background: var(--accent); }}
  .toggle-wrap.active .toggle-switch::after {{ left: 21px; background: #fff; }}

  .legend-sep {{ width: 1px; height: 20px; background: var(--surface2); margin: 0 4px; }}
  .legend-key {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
  .legend-key-item {{ font-size: 0.78rem; color: var(--text-muted); white-space: nowrap; }}

  .flag-badge {{ font-size: 0.9rem; margin-right: 5px; display: inline; cursor: default; }}
  .arabic-flag-img {{ width: 18px; height: 13px; vertical-align: -1px; border-radius: 1px; }}
  .flags-hidden .flag-badge {{ display: none !important; }}
  .flags-hidden .dept-flags {{ display: none !important; }}
  .flags-hidden .year-pct {{ display: none !important; }}
  .flags-hidden .dept-pct {{ display: none !important; }}
  .flags-hidden .uni-origin-stats {{ display: none !important; }}
  .flags-hidden .flags-only-legend {{ display: none !important; }}
  .ms-hidden .ms-group {{ display: none !important; }}
  .ms-hidden .year-ms-note {{ display: none !important; }}
  .old-hidden .year-block.pre-2010 {{ display: none !important; }}

  .funding-chart-wrap {{ background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 16px; margin-bottom: 16px; display: none; }}
  .funding-chart-wrap.visible {{ display: block; }}
  .funding-chart-wrap h3 {{ font-size: 0.9rem; margin-bottom: 4px; }}
  .funding-chart-wrap .funding-source {{ font-size: 0.75rem; color: var(--text-muted); margin-bottom: 8px; }}
  .funding-chart-wrap .funding-source a {{ color: var(--accent); text-decoration: none; }}
  .funding-chart-wrap canvas {{ max-height: 220px; }}
  .funding-panels {{ display: flex; gap: 16px; flex-wrap: wrap; align-items: stretch; }}
  .funding-panels > div {{ flex: 1; min-width: 280px; display: flex; flex-direction: column; }}
  .funding-panels canvas {{ flex: 1 1 auto; min-height: 220px; }}
  .finance-breakdown {{ margin-top: 12px; }}
  .finance-bar {{ display: flex; height: 28px; border-radius: 6px; overflow: hidden; margin: 8px 0 6px; }}
  .finance-bar > div {{ transition: width 0.3s; }}
  .finance-legend {{ display: flex; flex-wrap: wrap; gap: 10px; font-size: 0.75rem; color: var(--text-muted); }}
  .finance-legend span {{ display: flex; align-items: center; gap: 4px; }}
  .finance-legend .dot {{ width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }}
  .finance-stat {{ font-size: 0.82rem; color: var(--text); margin-top: 6px; }}
  .finance-stat strong {{ color: var(--accent); }}

  .dept-section {{ background: var(--surface); border-radius: 8px; margin-bottom: 8px; border: 1px solid var(--surface2); }}
  .dept-header {{ padding: 10px 16px; cursor: pointer; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
  .dept-header .dept-toggle {{ user-select: none; }}
  .dept-header:hover {{ background: var(--surface2); border-radius: 8px; }}
  .dept-toggle {{ font-size: 0.7rem; color: var(--text-muted); transition: transform 0.15s; }}
  .dept-section.collapsed .dept-toggle {{ transform: rotate(-90deg); }}
  .dept-section.collapsed .dept-body {{ display: none; }}
  .dept-name {{ font-weight: 600; font-size: 0.9rem; }}
  .dept-stats {{ font-size: 0.8rem; color: var(--text-muted); }}
  .dept-flags {{ font-size: 0.78rem; flex: 1; }}
  .dept-pct {{ font-size: 0.8rem; font-weight: 600; min-width: 110px; text-align: right; }}
  .pct-high {{ color: var(--red); }}
  .pct-med {{ color: var(--orange); }}
  .dept-body {{ padding: 0 16px 12px; }}

  .year-block {{ margin-top: 8px; }}
  .year-block .year-header {{ cursor: pointer; }}
  .year-block .year-header:hover {{ opacity: 0.85; }}
  .year-block.yr-collapsed .year-names {{ display: none; }}
  .year-block.yr-collapsed .year-toggle {{ transform: rotate(-90deg); }}
  .year-toggle {{ font-size: 0.6rem; color: var(--text-muted); transition: transform 0.15s; display: inline-block; margin-right: 4px; user-select: none; }}
  .year-header {{ display: flex; align-items: center; gap: 10px; padding: 4px 0; border-bottom: 1px solid var(--surface2); margin-bottom: 4px; }}
  .year-header .share-anchor {{ margin-left: auto; }}
  .year-label {{ font-weight: 700; font-size: 0.9rem; color: var(--accent); min-width: 40px; }}
  .year-count {{ font-size: 0.8rem; color: var(--text-muted); }}
  .year-pct {{ font-size: 0.8rem; font-weight: 600; }}

  .name-row {{ display: flex; padding: 3px 0; font-size: 0.82rem; gap: 8px; align-items: baseline; }}
  .name-row:hover {{ background: rgba(56,189,248,0.04); }}
  .name-col {{ min-width: 280px; max-width: 340px; display: flex; align-items: baseline; }}
  .name-link {{ color: var(--accent); text-decoration: none; }}
  .name-link:hover {{ text-decoration: underline; }}
  .name-nolink {{ color: var(--text); }}
  .title-col {{ color: var(--text-muted); font-size: 0.78rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 600px; }}

  .toolbar {{ position: sticky; top: 0; z-index: 10; background: var(--bg); padding: 12px 0 8px; }}
  .search-input {{ width: 100%; padding: 8px 14px; background: var(--surface); border: 1px solid var(--surface2); border-radius: 8px; color: var(--text); font-size: 0.9rem; outline: none; margin-bottom: 8px; }}
  .search-input:focus {{ border-color: var(--accent); }}
  .search-input::placeholder {{ color: var(--text-muted); }}
  .search-results {{ font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; display: none; }}
  #content {{ min-height: 200px; }}
  .placeholder-msg {{ color: var(--text-muted); font-size: 0.95rem; padding: 40px 0; }}
  /* The empty state used to be one muted line sitting under four live-looking
     toggles, so the page read as broken rather than as waiting for input. */
  .pick-prompt {{ border: 1px dashed var(--surface2); border-radius: 10px;
    padding: 28px 26px; margin: 26px 0 8px; background: var(--surface); }}
  .pick-lead {{ font-size: 1.05rem; font-weight: 600; margin: 0 0 .4rem; color: var(--text); }}
  .pick-sub {{ color: var(--text-muted); font-size: .9rem; line-height: 1.6;
    margin: 0; max-width: 62ch; }}
  /* The toggles control per-university panels and can do nothing before one is
     chosen. Leaving them fully operable and inert is what made them look broken. */
  body.no-uni .toggle-bar {{ opacity: .45; position: relative; }}
  body.no-uni .toggle-bar::after {{ content: 'Select a university to use these';
    font-size: .72rem; letter-spacing: .04em; text-transform: uppercase;
    color: var(--text-muted); width: 100%; text-align: center; padding-top: 6px; }}
  body.no-uni .toggle-wrap {{ cursor: not-allowed; }}
  .degree-badge {{ font-size: 0.65rem; font-weight: 700; padding: 1px 4px; border-radius: 3px; margin-right: 4px; vertical-align: 1px; }}
  .degree-phd {{ background: rgba(74,222,128,0.15); color: #4ade80; }}
  .degree-ms {{ background: rgba(251,191,36,0.15); color: #fbbf24; }}

  .ms-group {{ margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--surface2); }}
  .ms-group-header {{ display: flex; align-items: center; gap: 8px; cursor: pointer; padding: 4px 0; }}
  .ms-group-header:hover {{ opacity: 0.85; }}
  .ms-group.collapsed .ms-group-body {{ display: none; }}
  .ms-group.collapsed .dept-toggle {{ transform: rotate(-90deg); }}

  .top-nav {{ position: absolute; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 15; }}
  .top-nav-btn {{ background: var(--surface); border: 1px solid var(--surface2); color: var(--text-muted); font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; cursor: pointer; text-decoration: none; white-space: nowrap; }}
  .top-nav-btn:hover {{ background: var(--surface2); color: var(--text); }}
  .main {{ position: relative; }}

  .info-box {{ background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 14px 18px; margin-bottom: 16px; font-size: 0.82rem; color: var(--text-muted); line-height: 1.5; }}
  .info-box a {{ color: var(--accent); text-decoration: none; }}
  .info-box a:hover {{ text-decoration: underline; }}
  .info-box strong {{ color: var(--text); }}
  .info-box summary {{ cursor: pointer; font-weight: 600; color: var(--text); font-size: 0.85rem; }}

  /* National stats dashboard */
  .nat-hero {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 18px; }}
  .nat-stat {{ background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 14px 10px; text-align: center; }}
  .nat-stat .num {{ font-size: 1.6rem; font-weight: 800; line-height: 1.1; }}
  .nat-stat .lbl {{ font-size: 0.68rem; color: var(--text-muted); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.04em; }}
  .nat-stat.red .num {{ color: #ef4444; }}
  .nat-stat.blue .num {{ color: var(--accent); }}
  .nat-stat.pink .num {{ color: #f472b6; }}
  .nat-stat.orange .num {{ color: #fb923c; }}
  .nat-charts {{ display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }}
  .nat-chart-box {{ background: var(--surface); border: 1px solid var(--surface2); border-radius: 10px; padding: 14px; }}
  .nat-chart-box h3 {{ font-size: 0.85rem; margin-bottom: 2px; }}
  .nat-chart-box .nat-desc {{ font-size: 0.72rem; color: var(--text-muted); margin-bottom: 8px; }}
  .nat-chart-box canvas {{ max-height: 260px; }}
  .nat-chart-box .source {{ font-size: 0.68rem; color: var(--text-muted); margin-top: 6px; }}
  .nat-chart-box .source a {{ color: var(--accent); text-decoration: none; }}

  /* Tablet: 601-800px */
  @media (max-width: 800px) {{
    .sidebar {{ position: fixed; left: -260px; width: 260px; transition: left 0.25s; z-index: 100; }}
    .sidebar.open {{ left: 0; }}
    .sidebar-overlay {{ display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99; }}
    .sidebar.open + .sidebar-overlay {{ display: block; }}
    .main {{ margin-left: 0; padding: 16px 20px; }}
    .mobile-menu-btn {{ display: flex !important; }}
    h1 {{ font-size: 1.1rem; }}
    .subtitle {{ font-size: 0.78rem; }}
    .name-col {{ min-width: 180px; max-width: 240px; }}
    .title-col {{ font-size: 0.75rem; max-width: 400px; }}
    .name-row {{ font-size: 0.8rem; }}
    .toggle-bar {{ padding: 8px 10px; gap: 8px; flex-wrap: wrap; }}
    .toggle-label {{ font-size: 0.75rem; }}
    .dept-header {{ padding: 8px 12px; font-size: 0.82rem; flex-wrap: wrap; }}
    .dept-name {{ font-size: 0.82rem; }}
    .dept-pct {{ min-width: unset; }}
    .dept-flags {{ display: none; }}
    .year-header {{ flex-wrap: wrap; }}
    .funding-panels {{ flex-direction: column; }}
    .funding-panels > div {{ min-width: unset; }}
    .funding-chart-wrap {{ padding: 12px; }}
    .top-nav {{ gap: 6px; }}
    .top-nav-btn {{ font-size: 0.68rem; padding: 3px 8px; }}
    .info-box {{ padding: 10px 14px; font-size: 0.78rem; }}
    .uni-stats {{ font-size: 0.78rem; }}
    .nat-charts {{ grid-template-columns: 1fr; }}
    .nat-stat .num {{ font-size: 1.3rem; }}
    .nat-hero {{ grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }}
  }}

  /* Phone: <=600px */
  @media (max-width: 600px) {{
    .main {{ padding: 10px 10px; }}
    h1 {{ font-size: 1rem; }}
    h2 {{ font-size: 1.05rem; }}
    .subtitle {{ font-size: 0.72rem; }}
    .top-nav {{ flex-wrap: wrap; gap: 4px; top: 10px; right: 10px; }}
    .top-nav-btn {{ font-size: 0.62rem; padding: 2px 6px; }}
    .toggle-bar {{ padding: 6px 8px; gap: 6px; flex-wrap: wrap; }}
    .toggle-wrap {{ gap: 4px; }}
    .toggle-switch {{ width: 32px; height: 16px; }}
    .toggle-switch::after {{ width: 12px; height: 12px; top: 2px; left: 2px; }}
    .toggle-wrap.active .toggle-switch::after {{ left: 18px; }}
    .toggle-label {{ font-size: 0.7rem; }}
    .dept-filter-select {{ max-width: 140px; font-size: 0.75rem; }}
    .name-row {{ flex-direction: column; gap: 2px; padding: 3px 0; }}
    .name-col {{ min-width: unset; max-width: unset; width: 100%; }}
    .title-col {{ max-width: unset; width: 100%; white-space: normal; font-size: 0.7rem; line-height: 1.3; }}
    .dept-header {{ padding: 6px 10px; font-size: 0.78rem; gap: 6px; }}
    .dept-stats {{ font-size: 0.72rem; }}
    .dept-pct {{ font-size: 0.72rem; min-width: unset; text-align: left; }}
    .dept-flags {{ display: none; }}
    .dept-body {{ padding: 0 10px 8px; }}
    .year-header {{ gap: 6px; font-size: 0.78rem; }}
    .year-label {{ font-size: 0.82rem; }}
    .year-count {{ font-size: 0.72rem; }}
    .year-pct {{ font-size: 0.68rem; }}
    .uni-stats {{ font-size: 0.72rem; }}
    .uni-nra {{ font-size: 0.72rem; }}
    .funding-chart-wrap {{ padding: 8px; }}
    .funding-chart-wrap h3 {{ font-size: 0.82rem; }}
    .funding-source {{ font-size: 0.68rem; }}
    .share-anchor {{ font-size: 0.55rem; padding: 1px 3px; }}
    .degree-badge {{ font-size: 0.55rem; padding: 0 3px; }}
    .ms-group-header {{ font-size: 0.75rem; }}
    .info-box {{ padding: 8px 10px; font-size: 0.72rem; }}
    canvas {{ max-height: 180px !important; }}
  }}
  /* Coach marks */
  .coach-overlay {{ position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 200; transition: opacity 0.3s; }}
  .coach-highlight {{ position: absolute; z-index: 201; border-radius: 8px; box-shadow: 0 0 0 4px var(--accent), 0 0 20px rgba(56,189,248,0.4); transition: all 0.4s; }}
  .coach-tooltip {{ position: absolute; z-index: 202; background: var(--surface); border: 1px solid var(--accent); border-radius: 10px; padding: 14px 18px; max-width: 280px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); }}
  .coach-tooltip .coach-text {{ font-size: 0.88rem; color: var(--text); line-height: 1.4; }}
  .coach-tooltip .coach-step {{ font-size: 0.7rem; color: var(--text-muted); margin-bottom: 6px; }}
  .coach-tooltip .coach-arrow {{ position: absolute; width: 12px; height: 12px; background: var(--surface); border-left: 1px solid var(--accent); border-top: 1px solid var(--accent); }}
  .coach-tooltip .coach-arrow.left {{ left: -7px; top: 50%; transform: translateY(-50%) rotate(-45deg); }}
  .coach-tooltip .coach-arrow.right {{ right: -7px; top: 50%; transform: translateY(-50%) rotate(135deg); }}
  .coach-tooltip .coach-arrow.top {{ top: -7px; left: 30px; transform: rotate(45deg); }}
  .coach-dismiss {{ display: inline-block; margin-top: 10px; background: var(--accent); color: #0f172a; border: none; padding: 5px 14px; border-radius: 5px; font-size: 0.78rem; font-weight: 600; cursor: pointer; }}
  @keyframes coach-pulse {{ 0%,100% {{ box-shadow: 0 0 0 4px var(--accent), 0 0 20px rgba(56,189,248,0.4); }} 50% {{ box-shadow: 0 0 0 8px var(--accent), 0 0 30px rgba(56,189,248,0.6); }} }}
  .coach-highlight {{ animation: coach-pulse 1.5s ease-in-out infinite; }}

  .mobile-menu-btn {{ display: none; position: fixed; bottom: 16px; left: 16px; z-index: 98; background: var(--accent); color: #0f172a; border: none; border-radius: 50%; width: 48px; height: 48px; font-size: 1.3rem; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.3); align-items: center; justify-content: center; }}

  /* General dept visual distinction */
  .dept-section.dept-general {{ border-style: dashed; opacity: 0.85; }}
  .dept-section.dept-general .dept-name {{ font-style: italic; }}
  .dept-section.dept-general .dept-name::after {{ content: ' (uncategorized)'; font-size: 0.75rem; color: var(--text-muted); font-weight: 400; }}

  /* Department filter */
  .dept-filter-select {{ background: var(--surface); border: 1px solid var(--surface2); border-radius: 8px; color: var(--text); font-size: 0.82rem; padding: 6px 10px; outline: none; max-width: 220px; cursor: pointer; }}
  .dept-filter-select:focus {{ border-color: var(--accent); }}

  .nav-item-wrap {{ display: flex; align-items: center; }}
  .nav-item-wrap .nav-item {{ flex: 1; }}
</style>
</head>
<body class="flags-hidden ms-hidden old-hidden no-uni">

<a href="#main-content" class="skip-link" style="position:absolute;left:-9999px;top:0;z-index:999;background:var(--accent);color:#0f172a;padding:8px 16px;font-size:0.85rem;text-decoration:none;" onfocus="this.style.left='0'" onblur="this.style.left='-9999px'">Skip to content</a>

<button class="mobile-menu-btn" onclick="toggleSidebar()" aria-label="Open navigation menu">\u2630</button>
<nav class="sidebar" id="sidebar" aria-label="University navigation">
  <h3>PhD Demographics</h3>
  <div class="sidebar-group" id="sg-national">
    <div class="sidebar-section" onclick="toggleSidebarGroup('sg-national')"><span class="chevron">\u25BC</span> National</div>
    <div class="sidebar-group-content">
      <a href="javascript:void(0)" class="nav-item nav-page" onclick="showNational();">National Charts</a>
      <a href="ipeds_dashboard.html" class="nav-item nav-page">IPEDS PhD Dashboard</a>
      <a href="immigration.html" class="nav-item nav-page">Immigration Pipeline</a>
      <a href="pipeline.html" class="nav-item nav-page">Pipeline Analysis</a>
    </div>
  </div>
  <div class="sidebar-group" id="sg-universities">
    <div class="sidebar-section" onclick="toggleSidebarGroup('sg-universities')"><span class="chevron">\u25BC</span> Universities ({len(all_data)})</div>
    <div class="sidebar-group-content">
      {"".join(nav_items)}
    </div>
  </div>
  <div class="sidebar-group" id="sg-international">
    <div class="sidebar-section" onclick="toggleSidebarGroup('sg-international')"><span class="chevron">\u25BC</span> International</div>
    <div class="sidebar-group-content">
      <a href="india.html" class="nav-item nav-page">India (Outbound)</a>
      <a href="china.html" class="nav-item nav-page">China (Outbound)</a>
      <a href="canada.html" class="nav-item nav-page">Canada</a>
      <a href="uk.html" class="nav-item nav-page">United Kingdom</a>
      <a href="eu.html" class="nav-item nav-page">EU &amp; Germany</a>
      <a href="mexico.html" class="nav-item nav-page">Mexico</a>
      <a href="vwp.html" class="nav-item nav-page">Visa Waiver Program</a>
    </div>
  </div>
  <div class="sidebar-group" id="sg-reference">
    <div class="sidebar-section" onclick="toggleSidebarGroup('sg-reference')"><span class="chevron">\u25BC</span> Reference</div>
    <div class="sidebar-group-content">
      <a href="query.html" class="nav-item nav-page">Data Query (SQL)</a>
      <a href="data_sources.html" class="nav-item nav-page">Data Sources &amp; Methodology</a>
      <a href="implementation.html" class="nav-item nav-page">Implementation</a>
      <a href="data_catalog.json" class="nav-item nav-page">Data Catalog (JSON)</a>
      <a href="llms.txt" class="nav-item nav-page">WebMCP Integration</a>
    </div>
  </div>
  <div class="sidebar-group" id="sg-about">
    <div class="sidebar-section" onclick="toggleSidebarGroup('sg-about')"><span class="chevron">\u25BC</span> About</div>
    <div class="sidebar-group-content">
      <a href="about.html" class="nav-item nav-page">About this Project</a>
      <a href="submit.html" class="nav-item nav-page">Tip Line</a>
      <a href="https://andy-barr.com" target="_blank" rel="noopener" class="nav-item nav-page">Personal Webpage</a>
      <a href="https://buymeacoffee.com/andybarr" target="_blank" rel="noopener" class="nav-item nav-page">Support this Page</a>
    </div>
  </div>
</nav>
<div class="sidebar-overlay" onclick="toggleSidebar()" role="presentation"></div>

<main class="main" id="main-content">
  <header class="top-nav" role="banner">
    <a href="index.html" class="top-nav-btn">Education Index</a>
    <a href="{"stem.html" if is_nonstem else "non_stem.html"}" class="top-nav-btn">{"STEM View" if is_nonstem else "Non-STEM View"}</a>
    <a href="data_sources.html" class="top-nav-btn">Data Sources</a>
  </header>
  <h1>{"Non-STEM " if is_nonstem else ""}Thesis &amp; Dissertation Lists — High NRA Universities</h1>
  <p class="subtitle" style="font-size:0.78rem;color:var(--text-muted);margin-top:-2px;">NRA = Non-Resident Alien. Universities ranked by NRA share of STEM doctoral completions (IPEDS).</p>
  <p class="subtitle">{"Non-STEM fields (Education, Humanities, Social Sciences, etc.). " if is_nonstem else ""}Every name links to the university's institutional repository for direct verification. {sum(u['count'] for u in index_unis):,} total records across {len(all_data_sorted)} schools.</p>
  <div style="background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);border-radius:8px;padding:8px 14px;margin:10px 0 4px;font-size:0.82rem;color:#fbbf24;">Data scraping still in progress. Record counts may change as new data is collected.</div>

  <div id="info-section">
    <!-- National stats hero cards -->
    <div class="nat-hero">
      {('<div class="nat-stat red"><div class="num">269,323</div><div class="lbl">OPT Work Authorizations (2024)</div></div>' +
        '<div class="nat-stat blue"><div class="num">8,238</div><div class="lbl">Non-STEM PhDs Awarded across these 101 universities (2024)</div></div>' +
        '<div class="nat-stat pink"><div class="num">1,922</div><div class="lbl">NRA Non-STEM PhDs (23.3%)</div></div>' +
        '<div class="nat-stat orange"><div class="num">115,569</div><div class="lbl">Total non-STEM thesis records on this site</div></div>')
       if is_nonstem else
       ('<div class="nat-stat red"><div class="num">269,323</div><div class="lbl">OPT Work Authorizations (2024)</div></div>' +
        '<div class="nat-stat blue"><div class="num">49,012</div><div class="lbl">STEM PhDs Awarded (2024)</div></div>' +
        '<div class="nat-stat pink"><div class="num">15,814</div><div class="lbl">NRA STEM PhDs (32.3%)</div></div>' +
        '<div class="nat-stat orange"><div class="num">$40.8B</div><div class="lbl">University R&amp;D Spending (2024)</div></div>')}
    </div>

    <!-- Charts -->
    <div class="nat-charts">
      <div class="nat-chart-box" id="nat-phd">
        <h3>{"Non-STEM" if is_nonstem else "STEM"} PhD Completions by Citizenship<a class="share-anchor" href="#nat-phd" onclick="shareAnchor('nat-phd',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">{"Non-STEM PhDs (Education, Humanities, Social Sciences) saw NRA share rise from ~17% to ~23% over the same period." if is_nonstem else "NRA share grew from 32% to 34% while total PhDs rose 50% — American graduate production barely moved"}</p>
        <canvas id="nat-phd-chart"></canvas>
        <p class="source">Source: <a href="https://nces.ed.gov/ipeds/" target="_blank">IPEDS Completions Survey</a></p>
      </div>
      <div class="nat-chart-box" id="nat-opt">
        <h3>OPT Work Authorization Pipeline<a class="share-anchor" href="#nat-opt" onclick="shareAnchor('nat-opt',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">OPT authorizations grew 11x since 2007. The 2016 STEM OPT 24-month rule dramatically expanded foreign work authorization.</p>
        <canvas id="nat-opt-chart"></canvas>
        <p class="source">Source: <a href="https://studyinthestates.dhs.gov/sevis-by-the-numbers" target="_blank">ICE/SEVP SEVIS</a></p>
        <p class="source" style="margin-top:4px;font-size:0.7rem;"><strong>OPT</strong> (Optional Practical Training): 12-month post-graduation work authorization for F-1 visa holders. <strong>STEM OPT</strong>: additional 24-month extension for STEM graduates (expanded from 17 months in 2016). <strong>CPT</strong> (Curricular Practical Training): work authorization during enrollment, must be part of established curriculum.</p>
      </div>
      <div class="nat-chart-box" id="nat-funding"{' style="display:none;"' if is_nonstem else ''}>
        <h3>R&amp;D Funding vs American STEM PhDs<a class="share-anchor" href="#nat-funding" onclick="shareAnchor('nat-funding',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">University R&amp;D spending nearly doubled since 2010. American PhD production grew only 11%.</p>
        <canvas id="nat-funding-chart"></canvas>
        <p class="source">Source: <a href="https://ncses.nsf.gov/surveys/higher-education-research-development" target="_blank">NSF HERD Survey</a>, <a href="https://nces.ed.gov/ipeds/" target="_blank">IPEDS</a></p>
        <p class="source" style="margin-top:4px;font-size:0.7rem;"><strong>American STEM PhDs</strong> = Total STEM doctorate completions minus Non-Resident Alien (NRA) completions, from IPEDS. Includes US citizens and permanent residents of all races/ethnicities. <strong>R&amp;D Spending</strong> = total university R&amp;D expenditures from the NSF Higher Education Research &amp; Development (HERD) Survey.</p>
      </div>
      <div class="nat-chart-box" id="nat-total-pipeline">
        <h3>Total Foreign Work Authorizations<a class="share-anchor" href="#nat-total-pipeline" onclick="shareAnchor('nat-total-pipeline',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">Combined OPT + H-1B work authorizations issued per year. Foreign nationals working in the US via university pipeline.</p>
        <canvas id="nat-total-pipeline-chart"></canvas>
        <p class="source">Source: ICE/SEVP SEVIS, <a href="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" target="_blank">USCIS H-1B Employer Data Hub</a></p>
      </div>
      <div class="nat-chart-box" id="nat-visas">
        <h3>US Visa Issuances by Type<a class="share-anchor" href="#nat-visas" onclick="shareAnchor('nat-visas',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">F-1 (student), H-1B (specialty worker), J-1 (exchange visitor), and O-1 (extraordinary ability) visa stamps issued annually at US consulates.</p>
        <canvas id="nat-visa-chart"></canvas>
        <p class="source">Source: <a href="https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics.html" target="_blank">US State Department Visa Statistics</a></p>
      </div>
      <div class="nat-chart-box" id="nat-visa-calc">
        <h3>Cumulative Visa Calculator<a class="share-anchor" href="#nat-visa-calc" onclick="shareAnchor('nat-visa-calc',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">Total visa issuances between two years. Select a range to see cumulative counts.</p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
          <select id="cum-start" style="background:var(--surface2);border:1px solid var(--surface2);color:var(--text);padding:4px 8px;border-radius:4px;font-size:0.82rem;"></select>
          <span style="color:var(--text-muted);font-size:0.82rem;">to</span>
          <select id="cum-end" style="background:var(--surface2);border:1px solid var(--surface2);color:var(--text);padding:4px 8px;border-radius:4px;font-size:0.82rem;"></select>
        </div>
        <div id="cum-results" style="font-size:0.82rem;line-height:1.8;"></div>
        <p class="source">Source: US State Department visa issuances at consulates abroad</p>
      </div>
      <div class="nat-chart-box" id="nat-fields"{' style="display:none;"' if is_nonstem else ''}>
        <h3>NRA Enrollment by STEM Field<a class="share-anchor" href="#nat-fields" onclick="shareAnchor('nat-fields',event);return false;" title="Copy link to this chart" aria-label="Copy link to this chart">#</a></h3>
        <p class="nat-desc">In Computer Science and Engineering, the majority of graduate students are non-resident aliens.</p>
        <canvas id="nat-field-chart"></canvas>
        <p class="source">Source: <a href="https://ncses.nsf.gov/surveys/graduate-students-postdoctorates-in-science-and-engineering" target="_blank">NSF Graduate Student Survey (STEM only — non-STEM equivalent not yet plotted)</a></p>
      </div>
    </div>

    <div class="info-box">
      <details>
        <summary>About this data</summary>
        <p style="margin-top:8px;">
          <strong>This page shows ALL graduates</strong> — every student who submitted a thesis or dissertation
          to the institutional repository in the 2016–2024 window, not only non-resident aliens. Americans,
          permanent residents, and international students are all included.
        </p>
        <p style="margin-top:8px;">
          <strong>Data source:</strong> Names were collected from each university's
          <a href="https://www.openarchives.org/pmh/" target="_blank">OAI-PMH</a>
          "Theses and Dissertations" collections. These typically include <strong>both doctoral dissertations
          and master's theses</strong>. Only Caltech has explicit PhD-only filtering.
          Where possible, records are labeled
          <span style="color:#4ade80;">PhD</span> or <span style="color:#fbbf24;">MS</span>
          based on available metadata, but many records cannot be distinguished.
          Each name links directly to the original record for verification.
        </p>
        <p style="margin-top:8px;">
          <strong>IPEDS NRA %</strong> — NRA stands for
          <a href="https://nces.ed.gov/ipeds/report-your-data/race-ethnicity-reporting-changes" target="_blank">Non-Resident Alien</a>,
          the IPEDS classification for students on temporary visas (F-1, J-1, etc.) who are not
          US citizens or permanent residents. The percentage shown (e.g., Missouri S&amp;T 73.2%)
          represents the <strong>share of STEM doctoral degrees completed</strong> by NRA students at that
          university, as reported in the
          <a href="https://nces.ed.gov/ipeds/use-the-data/survey-components/9/completions" target="_blank">IPEDS Completions Survey</a>
          from the National Center for Education Statistics (NCES).
          This is a <strong>graduation metric</strong> — it counts PhD degrees awarded, not enrollment.
          Universities are ranked by this NRA share of STEM doctoral completions.
        </p>
        <p style="margin-top:8px;">
          <strong>Origin estimates</strong> are produced by a name-classification model and should be treated as approximate.
          Toggle "Show estimated origin" above to display or hide these labels.
        </p>
      </details>
    </div>
  </div>

  <div class="toolbar">
    <!-- Search disabled — will be on dedicated cross-university page -->
    <input type="text" class="search-input" id="search" placeholder="Search by name across all universities..." oninput="debounceSearch(this.value)" style="display:none;">
    <div class="toggle-bar">
      <div class="toggle-wrap" onclick="toggleMs()" id="ms-toggle" role="switch" aria-checked="false" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){{event.preventDefault();this.click();}}">
        <div class="toggle-switch"></div>
        <span class="toggle-label">Show Master's Theses</span>
      </div>
      <div class="toggle-wrap" onclick="toggleFunding()" id="funding-toggle" role="switch" aria-checked="false" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){{event.preventDefault();this.click();}}">
        <div class="toggle-switch"></div>
        <span class="toggle-label">R&amp;D Funding</span>
      </div>
      <div class="toggle-wrap" onclick="toggleEnrollment()" id="enrollment-toggle" role="switch" aria-checked="false" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){{event.preventDefault();this.click();}}">
        <div class="toggle-switch"></div>
        <span class="toggle-label">Enrollment</span>
      </div>
      <div class="toggle-wrap" onclick="toggleH1b()" id="h1b-toggle" role="switch" aria-checked="false" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' '){{event.preventDefault();this.click();}}">
        <div class="toggle-switch"></div>
        <span class="toggle-label">H-1B &amp; OPT</span>
      </div>
      <div class="toggle-wrap" onclick="toggleOld()" id="old-toggle" style="display:none;">
        <div class="toggle-switch"></div>
        <span class="toggle-label">Show Pre-2010 Records</span>
      </div>
      <div class="legend-key flags-only-legend" style="display:none;">
        {"".join(legend_key_items)}
      </div>
    </div>
    <div class="search-results" id="search-results"></div>
  </div>

  <div id="funding-chart-container" class="funding-chart-wrap" style="position:relative;">
    <a class="share-anchor" href="#funding" onclick="shareAnchor(panelAnchorId('funding'),event);return false;" title="Copy link to funding panel" aria-label="Copy link to funding panel" style="position:absolute;top:12px;right:12px;">#</a>
    <h3 id="funding-chart-title">R&amp;D Expenditures</h3>
    <div class="funding-source">Sources: <a href="https://ncses.nsf.gov/surveys/higher-education-research-development/2024" target="_blank">NSF HERD Survey</a> (R&amp;D) · <a href="https://nces.ed.gov/ipeds/" target="_blank">IPEDS Finance Survey</a> (Revenue) · <a href="https://shef.sheeo.org/" target="_blank">SHEEO SHEF</a> (State Appropriations) · <a href="https://www.usaspending.gov/" target="_blank">USAspending.gov</a> (Federal Awards)</div>
    <div class="funding-panels">
      <div>
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">R&amp;D Expenditures (<a href="https://ncses.nsf.gov/surveys/higher-education-research-development/2024" target="_blank" style="color:var(--accent);text-decoration:none;">NSF HERD</a>)</div>
        <canvas id="funding-chart"></canvas>
      </div>
      <div id="finance-breakdown" class="finance-breakdown" style="display:none;">
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Revenue by Source (<a href="https://nces.ed.gov/ipeds/" target="_blank" style="color:var(--accent);text-decoration:none;">IPEDS</a>)</div>
        <canvas id="finance-chart" style="max-height:220px;"></canvas>
        <div id="finance-details" style="margin-top:8px;font-size:0.78rem;color:var(--text-muted);line-height:1.6;"></div>
      </div>
    </div>
    <div id="state-funding-row" style="margin-top:14px;display:none;border-top:1px solid var(--surface2);padding-top:10px;">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">State Higher-Ed Appropriations Context (<a href="https://shef.sheeo.org/" target="_blank" style="color:var(--accent);text-decoration:none;">SHEEO SHEF</a>)</div>
      <div id="state-funding-content" style="font-size:0.78rem;color:var(--text-muted);line-height:1.6;"></div>
    </div>
    <div id="usaspending-row" style="margin-top:10px;display:none;font-size:0.78rem;color:var(--text-muted);">
      <strong style="color:var(--text);">Federal Awards (USAspending.gov):</strong>
      <span id="usaspending-content"></span>
    </div>
    <div id="grants-row" style="margin-top:14px;display:none;border-top:1px solid var(--surface2);padding-top:10px;">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Federal Grant Obligations (<a href="https://www.nsf.gov/awardsearch/" target="_blank" style="color:var(--accent);text-decoration:none;">NSF Award Search</a> · <a href="https://reporter.nih.gov/" target="_blank" style="color:var(--accent);text-decoration:none;">NIH RePORTER</a>)</div>
      <canvas id="grants-chart" style="max-height:220px;"></canvas>
      <div id="grants-details" style="margin-top:8px;font-size:0.78rem;color:var(--text-muted);line-height:1.6;"></div>
    </div>
  </div>

  <div id="enrollment-container" class="funding-chart-wrap" style="position:relative;">
    <a class="share-anchor" href="#enrollment" onclick="shareAnchor(panelAnchorId('enrollment'),event);return false;" title="Copy link to enrollment panel" aria-label="Copy link to enrollment panel" style="position:absolute;top:12px;right:12px;">#</a>
    <h3 id="enrollment-title">Graduate Enrollment Demographics</h3>
    <div class="funding-source">Sources: <a href="https://ncses.nsf.gov/surveys/graduate-students-postdoctorates-in-science-and-engineering" target="_blank">NSF GSS</a> (Enrollment, 2024) · <a href="https://nces.ed.gov/ipeds/" target="_blank">IPEDS Completions</a> (PhD Trend, 2010–2024)</div>
    <div id="enrollment-stats" style="margin-bottom:14px;"></div>
    <div class="funding-panels">
      <div>
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Enrollment by Citizenship (<a href="https://ncses.nsf.gov/surveys/graduate-students-postdoctorates-in-science-and-engineering" target="_blank" style="color:var(--accent);text-decoration:none;">NSF GSS</a>)</div>
        <canvas id="enrollment-field-chart"></canvas>
      </div>
      <div>
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">PhD Completions Trend (<a href="https://nces.ed.gov/ipeds/" target="_blank" style="color:var(--accent);text-decoration:none;">IPEDS</a>)</div>
        <canvas id="completions-trend-chart"></canvas>
      </div>
    </div>
    <div id="enrollment-race-row" style="margin-top:18px;display:none;">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Self-Reported Race / Citizenship of All Graduate Students (<a href="https://nces.ed.gov/ipeds/" target="_blank" style="color:var(--accent);text-decoration:none;">IPEDS Fall Enrollment</a>)</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">How graduate students self-identify on IPEDS. Nonresident Alien is a citizenship status, not a race — students on temporary visas are reported separately and never asked their race. The remainder ("Other / Unknown") includes American Indian/Alaska Native, Native Hawaiian/Pacific Islander, Two-or-More Races, and students who declined to report.</div>
      <canvas id="enrollment-race-chart" style="max-height:90px;"></canvas>
      <div id="enrollment-race-legend" style="display:flex;flex-wrap:wrap;gap:14px;font-size:0.72rem;margin-top:8px;color:var(--text-muted);"></div>
    </div>
    <div id="faculty-race-row" style="margin-top:18px;display:none;">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Self-Reported Race / Citizenship of Instructional Faculty (<a href="https://nces.ed.gov/ipeds/" target="_blank" style="color:var(--accent);text-decoration:none;">IPEDS Human Resources</a>)</div>
      <div style="font-size:0.72rem;color:var(--text-muted);margin-bottom:8px;">How tenured and tenure-track faculty self-identify on IPEDS. Same caveat applies — Nonresident Alien is a citizenship status, not a race.</div>
      <canvas id="faculty-race-chart" style="max-height:90px;"></canvas>
      <div id="faculty-race-legend" style="display:flex;flex-wrap:wrap;gap:14px;font-size:0.72rem;margin-top:8px;color:var(--text-muted);"></div>
    </div>
  </div>

  <div id="h1b-container" class="funding-chart-wrap" style="position:relative;">
    <a class="share-anchor" href="#h1b" onclick="shareAnchor(panelAnchorId('h1b'),event);return false;" title="Copy link to H-1B panel" aria-label="Copy link to H-1B panel" style="position:absolute;top:12px;right:12px;">#</a>
    <h3 id="h1b-title">Immigration via Education Pipeline</h3>
    <div class="funding-source">Sources: <a href="https://studyinthestates.dhs.gov/sevis-by-the-numbers" target="_blank">ICE/SEVP</a> (OPT, CY 2017-2024) · <a href="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" target="_blank">USCIS</a> (H-1B, FY 2010-2026) · <a href="https://www.dol.gov/agencies/eta/foreign-labor/performance" target="_blank">DOL</a> (LCA + PERM)</div>
    <div id="h1b-pipeline-summary" style="font-size:0.85rem;padding:8px 12px;margin-bottom:8px;background:var(--surface);border-radius:6px;display:none;"></div>
    <div class="funding-panels">
      <div>
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">OPT Students Employed (<a href="https://studyinthestates.dhs.gov/sevis-by-the-numbers" target="_blank" style="color:var(--accent);text-decoration:none;">ICE/SEVP</a>)</div>
        <canvas id="opt-chart" style="max-height:200px;"></canvas>
      </div>
      <div>
        <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">H-1B Petitions Filed as Employer (<a href="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" target="_blank" style="color:var(--accent);text-decoration:none;">USCIS</a>)</div>
        <canvas id="h1b-chart" style="max-height:200px;"></canvas>
      </div>
    </div>
    <div style="margin-top:8px;">
      <div style="font-weight:600;font-size:0.85rem;margin-bottom:6px;">Top H-1B Job Titles &amp; Salaries (<a href="https://www.dol.gov/agencies/eta/foreign-labor/performance" target="_blank" style="color:var(--accent);text-decoration:none;">DOL LCA</a>)</div>
      <div id="h1b-details" style="font-size:0.8rem;color:var(--text-muted);"></div>
    </div>
  </div>

  <div id="content" role="region" aria-label="University data" aria-live="polite">
    <div class="pick-prompt">
      <p class="pick-lead">Pick a university to begin</p>
      <p class="pick-sub">Choose any institution from the list on the left.
      The charts above are national; the name lists, funding, enrolment and
      H-1B panels are per-university and appear once you select one.</p>
    </div>
  </div>

  <footer class="site-footer" style="text-align:center;padding:28px 16px 32px;font-size:0.74rem;color:#64748b;border-top:1px solid #334155;margin-top:32px;line-height:1.7;">
    A project by <a href="https://andy-barr.com" target="_blank" rel="noopener" style="color:#94a3b8;text-decoration:none;font-weight:600;">Andy Barr</a>. Data from US federal agencies (NCES, NSF, DOL, DHS) and university institutional repositories.<br>
    <a href="about.html" style="color:#38bdf8;text-decoration:none;">About</a> &middot;
    <a href="data_sources.html" style="color:#38bdf8;text-decoration:none;">Methodology</a> &middot;
    <a href="submit.html" style="color:#38bdf8;text-decoration:none;">Tip Line</a> &middot;
    <a href="https://x.com/andy_barr_data" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none;">Follow on X</a> &middot;
    <a href="https://buymeacoffee.com/andybarr" target="_blank" rel="noopener" style="color:#38bdf8;text-decoration:none;">Support this Page</a>
  </footer>
</main>

<script>
const DATA = {data_json};
const DATA_DIR = '{data_dir}';
const ORIGINS = {origins_js};
const ORIGIN_KEYS = Object.keys(ORIGINS);
let flagsVisible = false;
let msVisible = false;
let oldVisible = false;
let currentKey = null;
let currentAnchor = null;  // deepest addressed thing: 'mit--chemistry--2024'
let searchTimer = null;
const FUNDING = {funding_json};
const IS_NONSTEM = {str(is_nonstem).lower()};
let fundingVisible = false;
let enrollmentVisible = false;
let enrollmentFieldChart = null;
let completionsTrendChart = null;
let enrollmentRaceChart = null;
let facultyRaceChart = null;
let fundingChart = null;
let grantsChart = null;
let financeChart = null;

// Build lookup by key (lightweight — no records yet)
const UNI_MAP = {{}};
DATA.forEach(u => UNI_MAP[u.key] = u);

// Cache for fetched university data
const UNI_CACHE = {{}};

// ============================================================
// NATIONAL STATS CHARTS (shown when no university selected)
// ============================================================
let natCharts = [];

function initNationalCharts() {{
  if (natCharts.length > 0) return; // already initialized
  Chart.defaults.color = '#94a3b8';
  Chart.defaults.borderColor = '#334155';
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  // -- IPEDS STEM PhD completions data (2010-2024) --
  const phdYears = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  const phdTotal = [32743,34257,35500,37308,39272,39507,40148,40866,42252,42937,43293,42533,46400,47779,49012];
  const phdNRA =   [11120,11580,12043,12785,13502,13450,13480,13749,14369,14655,14984,14673,16294,15957,15814];
  const phdWhite = [7000,15595,16116,16713,17505,17449,17557,17797,18181,18114,18174,17249,18471,19045,19451];
  // American = Total - NRA (domestic citizens + perm residents)
  const phdAmerican = phdTotal.map((t, i) => t - phdNRA[i]);

  natCharts.push(new Chart(document.getElementById('nat-phd-chart'), {{
    type: 'line',
    data: {{
      labels: phdYears,
      datasets: [
        {{ label: 'Total STEM PhDs', data: phdTotal, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.08)', borderWidth: 2, pointRadius: 3, tension: 0.3, fill: false }},
        {{ label: 'American (Citizens + PR)', data: phdAmerican, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.12)', borderWidth: 2.5, pointRadius: 3, tension: 0.3, fill: true }},
        {{ label: 'Non-Resident Alien', data: phdNRA, borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,0.12)', borderWidth: 2.5, pointRadius: 3, tension: 0.3, fill: true }},
      ]
    }},
    options: {{
      responsive: true,
      interaction: {{ mode: 'index', intersect: false }},
      plugins: {{
        legend: {{ position: 'top', labels: {{ boxWidth: 12, padding: 10, font: {{ size: 11 }} }} }},
        tooltip: {{ callbacks: {{ label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() }} }}
      }},
      scales: {{
        y: {{ beginAtZero: false, ticks: {{ callback: v => (v/1000).toFixed(0) + 'k' }} }}
      }}
    }}
  }}));

  // -- OPT national trends --
  const optYears = ['2007','2008','2009','2010','2011','2012','2013','2014','2015','2016','2017','2018','2019','2020','2021','2022','2023','2024'];
  const optData = [24836,45304,46116,50992,56300,62427,67502,77369,99016,129811,140152,130512,125215,112930,102985,106791,152361,173939];
  const stemOpt = [2,2128,5869,9356,13504,15937,18782,21456,27493,41782,64481,69650,72116,63906,61543,64844,62036,95384];
  const cptData = [57403,61171,48568,57409,63911,68482,76223,92528,111135,122529,132380,151525,116338,97368,91352,129849,131117,130586];

  natCharts.push(new Chart(document.getElementById('nat-opt-chart'), {{
    type: 'line',
    data: {{
      labels: optYears,
      datasets: [
        {{ label: 'OPT', data: optData, borderColor: 'rgba(56,189,248,0.9)', backgroundColor: 'rgba(56,189,248,0.15)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }},
        {{ label: 'STEM OPT Extension', data: stemOpt, borderColor: 'rgba(167,139,250,0.9)', backgroundColor: 'rgba(167,139,250,0.15)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }},
        {{ label: 'CPT', data: cptData, borderColor: 'rgba(52,211,153,0.7)', fill: false, tension: 0.3, pointRadius: 1, borderWidth: 1.5, borderDash: [4,4] }},
      ]
    }},
    options: {{
      responsive: true,
      interaction: {{ mode: 'index', intersect: false }},
      plugins: {{
        legend: {{ position: 'top', labels: {{ boxWidth: 12, padding: 10, font: {{ size: 11 }} }} }},
        tooltip: {{ callbacks: {{ label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() }} }}
      }},
      scales: {{
        y: {{ ticks: {{ callback: v => (v/1000).toFixed(0) + 'K' }} }}
      }}
    }}
  }}));

  // -- Total Foreign Work Authorizations (OPT + H-1B) --
  const pipeYears = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  const pipeOpt = [50992,56300,62427,67502,77369,99016,129811,140152,130512,125215,112930,102985,106791,152361,173939];
  const pipeStemOpt = [9356,13504,15937,18782,21456,27493,41782,64481,69650,72116,63906,61543,64844,62036,95384];
  const pipeCpt = [57409,63911,68482,76223,92528,111135,122529,132380,151525,116338,97368,91352,129849,131117,130586];
  const pipeH1b = [8677,12418,8559,10775,11879,9198,9067,9285,9099,11707,28390,34546,23366,10382,10739];
  const pipeTotal = pipeYears.map((_, i) => pipeOpt[i] + pipeStemOpt[i] + pipeCpt[i] + pipeH1b[i]);

  natCharts.push(new Chart(document.getElementById('nat-total-pipeline-chart'), {{
    type: 'bar',
    data: {{
      labels: pipeYears,
      datasets: [
        {{ label: 'OPT', data: pipeOpt, backgroundColor: 'rgba(56,189,248,0.7)', borderRadius: 2 }},
        {{ label: 'STEM OPT', data: pipeStemOpt, backgroundColor: 'rgba(167,139,250,0.7)', borderRadius: 2 }},
        {{ label: 'CPT', data: pipeCpt, backgroundColor: 'rgba(52,211,153,0.7)', borderRadius: 2 }},
        {{ label: 'H-1B (universities)', data: pipeH1b, backgroundColor: 'rgba(251,146,60,0.7)', borderRadius: 2 }},
      ]
    }},
    options: {{
      responsive: true,
      interaction: {{ mode: 'index', intersect: false }},
      plugins: {{
        legend: {{ position: 'top', labels: {{ boxWidth: 12, padding: 10, font: {{ size: 11 }} }} }},
        tooltip: {{
          callbacks: {{
            label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString(),
            afterBody: items => 'Total: ' + pipeTotal[items[0].dataIndex].toLocaleString()
          }}
        }}
      }},
      scales: {{
        x: {{ stacked: true, grid: {{ display: false }} }},
        y: {{ stacked: true, ticks: {{ callback: v => (v/1000).toFixed(0) + 'K' }} }}
      }}
    }}
  }}));

  // -- R&D Funding vs American PhDs (dual axis) --
  const fundYears = [2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  const rdBillions = [21.2,22.3,22.7,23.3,23.5,24.1,25.1,26.2,27.7,29.0,29.9,31.0,33.5,37.7,40.8];
  // American STEM PhDs (Total - NRA from IPEDS)
  const amPhds = phdAmerican;

  natCharts.push(new Chart(document.getElementById('nat-funding-chart'), {{
    type: 'bar',
    data: {{
      labels: fundYears,
      datasets: [
        {{ label: 'R&D Spending ($B)', data: rdBillions, backgroundColor: 'rgba(251,146,60,0.7)', borderRadius: 3, yAxisID: 'y', order: 2 }},
        {{ label: 'American STEM PhDs', data: amPhds, type: 'line', borderColor: '#38bdf8', borderWidth: 2.5, pointRadius: 3, tension: 0.3, yAxisID: 'y1', order: 1 }},
      ]
    }},
    options: {{
      responsive: true,
      interaction: {{ mode: 'index', intersect: false }},
      plugins: {{
        legend: {{ position: 'top', labels: {{ boxWidth: 12, padding: 10, font: {{ size: 11 }} }} }},
        tooltip: {{ callbacks: {{
          label: ctx => {{
            if (ctx.datasetIndex === 0) return 'R&D: $' + ctx.parsed.y.toFixed(1) + 'B';
            return 'American PhDs: ' + ctx.parsed.y.toLocaleString();
          }}
        }} }}
      }},
      scales: {{
        y: {{ position: 'left', beginAtZero: true, ticks: {{ callback: v => '$' + v + 'B' }}, title: {{ display: true, text: 'R&D ($B)', font: {{ size: 10 }} }} }},
        y1: {{ position: 'right', grid: {{ drawOnChartArea: false }}, ticks: {{ callback: v => (v/1000).toFixed(0) + 'k' }}, title: {{ display: true, text: 'American STEM PhDs', font: {{ size: 10 }} }} }}
      }}
    }}
  }}));

  // -- NRA share by STEM field (horizontal bar) --
  const fieldLabels = ['Computer & Info Sci','Engineering','Math & Statistics','Interdisciplinary','Physical Sciences','Bio & Biomedical','Geosciences','Health (Clinical)'];
  const fieldPct = [59.8, 50.7, 51.6, 45.4, 41.7, 26.3, 23.8, 11.9];

  natCharts.push(new Chart(document.getElementById('nat-field-chart'), {{
    type: 'bar',
    data: {{
      labels: fieldLabels,
      datasets: [{{
        label: 'NRA %',
        data: fieldPct,
        backgroundColor: fieldPct.map(v => v > 50 ? '#ef4444' : v > 35 ? '#fb923c' : '#38bdf8'),
        borderRadius: 4,
      }}]
    }},
    options: {{
      indexAxis: 'y',
      responsive: true,
      plugins: {{
        legend: {{ display: false }},
        tooltip: {{ callbacks: {{ label: ctx => ctx.parsed.x.toFixed(1) + '% Non-Resident Alien' }} }}
      }},
      scales: {{
        x: {{ max: 70, ticks: {{ callback: v => v + '%' }} }}
      }}
    }}
  }}));

  // -- US Visa Issuances by Type --
  const visaYears = [2007,2008,2009,2010,2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024];
  const f1Data = [298393,340711,331208,385210,447410,486900,534320,595569,644233,471728,393573,362929,388839,111387,357839,411131,445418,400737];
  const h1bIss = [154726,129464,110367,117409,129134,135530,153223,161369,172748,180057,179049,179049,188123,124398,61569,206002,265777,219659];
  const j1Data = [322514,313279,311970,322330,312063,313544,310329,318844,340532,338477,309015,325070,347560,75479,129662,284486,316693,322820];
  const o1Data = [9014,9635,8696,8589,10590,11932,12789,13865,14337,15918,16497,16818,17751,8838,7294,19102,18994,19457];
  const l1Data = [84532,84078,64696,74719,70728,62430,66700,71513,78537,79306,78178,74388,76988,35228,24863,72958,76671,71799];

  natCharts.push(new Chart(document.getElementById('nat-visa-chart'), {{
    type: 'line',
    data: {{
      labels: visaYears,
      datasets: [
        {{ label: 'F-1 (Student)', data: f1Data, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.1)', fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2 }},
        {{ label: 'J-1 (Exchange)', data: j1Data, borderColor: '#4ade80', fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2 }},
        {{ label: 'H-1B (Worker)', data: h1bIss, borderColor: '#fb923c', fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2 }},
        {{ label: 'L-1 (Transfer)', data: l1Data, borderColor: '#f472b6', fill: false, tension: 0.3, pointRadius: 2, borderWidth: 2 }},
        {{ label: 'O-1 (Extraordinary)', data: o1Data, borderColor: '#a78bfa', fill: false, tension: 0.3, pointRadius: 1, borderWidth: 1.5, borderDash: [4,4] }},
      ]
    }},
    options: {{
      responsive: true,
      interaction: {{ mode: 'index', intersect: false }},
      plugins: {{
        legend: {{ position: 'top', labels: {{ boxWidth: 12, padding: 10, font: {{ size: 11 }} }} }},
        tooltip: {{ callbacks: {{ label: ctx => ctx.dataset.label + ': ' + ctx.parsed.y.toLocaleString() }} }}
      }},
      scales: {{
        y: {{ ticks: {{ callback: v => (v/1000).toFixed(0) + 'K' }} }}
      }}
    }}
  }}));

  // Cumulative visa calculator
  const cumData = {{
    'F-1 (Student)': {{2007:298393,2008:340711,2009:331208,2010:385210,2011:447410,2012:486900,2013:534320,2014:595569,2015:644233,2016:471728,2017:393573,2018:362929,2019:388839,2020:111387,2021:357839,2022:411131,2023:445418,2024:400737}},
    'H-1B (Worker)': {{2007:154726,2008:129464,2009:110367,2010:117409,2011:129134,2012:135530,2013:153223,2014:161369,2015:172748,2016:180057,2017:179049,2018:179049,2019:188123,2020:124398,2021:61569,2022:206002,2023:265777,2024:219659}},
    'J-1 (Exchange)': {{2007:322514,2008:313279,2009:311970,2010:322330,2011:312063,2012:313544,2013:310329,2014:318844,2015:340532,2016:338477,2017:309015,2018:325070,2019:347560,2020:75479,2021:129662,2022:284486,2023:316693,2024:322820}},
    'L-1 (Transfer)': {{2007:84532,2008:84078,2009:64696,2010:74719,2011:70728,2012:62430,2013:66700,2014:71513,2015:78537,2016:79306,2017:78178,2018:74388,2019:76988,2020:35228,2021:24863,2022:72958,2023:76671,2024:71799}},
    'O-1 (Extraordinary)': {{2007:9014,2008:9635,2009:8696,2010:8589,2011:10590,2012:11932,2013:12789,2014:13865,2015:14337,2016:15918,2017:16497,2018:16818,2019:17751,2020:8838,2021:7294,2022:19102,2023:18994,2024:19457}},
    'OPT (Work Auth)': {{2007:24836,2008:45304,2009:46116,2010:50992,2011:56300,2012:62427,2013:67502,2014:77369,2015:99016,2016:129811,2017:140152,2018:130512,2019:125215,2020:112930,2021:102985,2022:106791,2023:152361,2024:173939}},
    'STEM OPT Extension': {{2007:2,2008:2128,2009:5869,2010:9356,2011:13504,2012:15937,2013:18782,2014:21456,2015:27493,2016:41782,2017:64481,2018:69650,2019:72116,2020:63906,2021:61543,2022:64844,2023:62036,2024:95384}},
  }};
  const cumYears = Array.from({{length: 18}}, (_, i) => 2007 + i);
  const startSel = document.getElementById('cum-start');
  const endSel = document.getElementById('cum-end');
  cumYears.forEach(y => {{
    startSel.innerHTML += `<option value="${{y}}" ${{y===2012?'selected':''}}>${{y}}</option>`;
    endSel.innerHTML += `<option value="${{y}}" ${{y===2016?'selected':''}}>${{y}}</option>`;
  }});
  function updateCum() {{
    const s = parseInt(startSel.value), e = parseInt(endSel.value);
    if (s > e) {{ document.getElementById('cum-results').innerHTML = '<span style="color:var(--red);">Start year must be ≤ end year</span>'; return; }}
    let html = '<table style="width:100%;border-collapse:collapse;">';
    html += '<tr style="border-bottom:1px solid var(--surface2);"><th style="text-align:left;padding:3px 0;font-size:0.75rem;color:var(--text-muted);">Visa Type</th><th style="text-align:right;padding:3px 0;font-size:0.75rem;color:var(--text-muted);">Cumulative</th><th style="text-align:right;padding:3px 0;font-size:0.75rem;color:var(--text-muted);">Avg/Year</th></tr>';
    let grandTotal = 0;
    const span = e - s + 1;
    for (const [label, data] of Object.entries(cumData)) {{
      let total = 0;
      for (let y = s; y <= e; y++) total += data[y] || 0;
      grandTotal += total;
      html += `<tr><td style="padding:3px 0;">${{label}}</td><td style="text-align:right;color:var(--accent);font-weight:600;">${{total.toLocaleString()}}</td><td style="text-align:right;color:var(--text-muted);">${{Math.round(total/span).toLocaleString()}}</td></tr>`;
    }}
    html += `<tr style="border-top:1px solid var(--surface2);font-weight:700;"><td style="padding:4px 0;">All Types</td><td style="text-align:right;color:var(--accent);">${{grandTotal.toLocaleString()}}</td><td style="text-align:right;color:var(--text-muted);">${{Math.round(grandTotal/span).toLocaleString()}}/yr</td></tr>`;
    html += '</table>';
    document.getElementById('cum-results').innerHTML = html;
  }}
  startSel.onchange = updateCum;
  endSel.onchange = updateCum;
  updateCum();
}}

function destroyNationalCharts() {{
  natCharts.forEach(c => c.destroy());
  natCharts = [];
}}

// Initialize national charts on page load (if no university selected)
setTimeout(() => {{
  if (!currentKey && document.getElementById('info-section').style.display !== 'none') {{
    initNationalCharts();
  }}
}}, 100);

function esc(s) {{ return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'); }}

function slug(s) {{ return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }}

function expandAllDepts() {{
  document.querySelectorAll('#content .dept-section.collapsed').forEach(el => el.classList.remove('collapsed'));
}}
function collapseAllDepts() {{
  document.querySelectorAll('#content .dept-section:not(.collapsed)').forEach(el => el.classList.add('collapsed'));
}}
function expandAllYears(btn) {{
  const deptBody = btn.closest('.dept-body');
  if (deptBody) deptBody.querySelectorAll('.year-block.yr-collapsed').forEach(el => el.classList.remove('yr-collapsed'));
}}
function collapseAllYears(btn) {{
  const deptBody = btn.closest('.dept-body');
  if (deptBody) deptBody.querySelectorAll('.year-block:not(.yr-collapsed)').forEach(el => el.classList.add('yr-collapsed'));
}}

function badge(cat) {{
  if (!ORIGINS[cat]) return '';
  const [flag, label] = ORIGINS[cat];
  if (cat === 'arabic') return '<span class="flag-badge" data-origin="arabic" title="Arabic"><img src="arabic_language_flag.svg" class="arabic-flag-img" alt="Arabic"></span>';
  return `<span class="flag-badge" data-origin="${{cat}}" title="${{label}}">${{flag}}</span>`;
}}

function degreeBadge(deg) {{
  if (deg === 'phd') return '<span class="degree-badge degree-phd">PhD</span>';
  if (deg === 'ms') return '<span class="degree-badge degree-ms">MS</span>';
  return '';
}}

function renderUni(uni) {{
  // records: [dept, year, name, cat, conf, title, url, degree]
  // Group by dept
  const deptMap = {{}};
  uni.records.forEach(r => {{
    const d = r[0];
    if (!deptMap[d]) deptMap[d] = [];
    deptMap[d].push(r);
  }});

  // Compute stats per dept
  const depts = Object.entries(deptMap).map(([dept, recs]) => {{
    const stats = {{total: recs.length}};
    ORIGIN_KEYS.forEach(o => stats[o] = 0);
    recs.forEach(r => {{ if (ORIGINS[r[3]]) stats[r[3]]++; }});
    const classified = ORIGIN_KEYS.reduce((s, o) => s + stats[o], 0);
    stats.classifiedPct = recs.length ? classified / recs.length * 100 : 0;
    return {{dept, recs, stats}};
  }}).filter(d => d.stats.total >= 5 || (d.stats.classifiedPct >= 5 && d.stats.total >= 1))
    .sort((a, b) => {{
      // Sort priority: departments with PhDs first, then MS-only, then General
      const isGeneral = d => d.toLowerCase() === 'general' || d.toLowerCase().endsWith('(general)');
      const aGen = isGeneral(a.dept) ? 2 : 0;
      const bGen = isGeneral(b.dept) ? 2 : 0;
      // MS-only departments (0 PhDs) go near bottom, above General
      const aPhds = a.recs.filter(r => r[7] === 'phd').length;
      const bPhds = b.recs.filter(r => r[7] === 'phd').length;
      const aMsOnly = (aPhds === 0 && a.stats.total > 0) ? 1 : 0;
      const bMsOnly = (bPhds === 0 && b.stats.total > 0) ? 1 : 0;
      const aPriority = aGen || aMsOnly;
      const bPriority = bGen || bMsOnly;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return b.stats.total - a.stats.total;
    }});

  const allTotal = depts.reduce((s, d) => s + d.stats.total, 0);
  const originTotals = {{}};
  ORIGIN_KEYS.forEach(o => originTotals[o] = depts.reduce((s, d) => s + d.stats[o], 0));

  // Degree type counts
  let phdCount = 0, msCount = 0, unknownCount = 0;
  depts.forEach(d => d.recs.forEach(r => {{
    if (r[7] === 'phd') phdCount++;
    else if (r[7] === 'ms') msCount++;
    else unknownCount++;
  }}));

  let statsParts = [];
  if (phdCount > 0) statsParts.push(`<span style="color:#4ade80">${{phdCount}} PhD</span>`);
  if (msCount > 0) statsParts.push(`<span style="color:#fbbf24">${{msCount}} MS</span>`);
  if (unknownCount > 0) statsParts.push(`${{unknownCount}} unlabeled`);
  let originParts = [];
  ORIGIN_KEYS.forEach(o => {{
    if (originTotals[o] > 0) {{
      const [flag, label] = ORIGINS[o];
      originParts.push(`${{flag}} ${{originTotals[o]}} ${{label}}`);
    }}
  }});

  const repoBase = getRepoBase(uni);
  const repoLink = repoBase ? ` &middot; <a href="${{repoBase}}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:0.8rem;">Institutional Repository</a>` : '';
  // The university key is the canonical anchor segment — the same token used
  // in the sidebar links, /universities/<key>.html and data/stem/<key>.json.
  const uniSlug = uni.key || slug(uni.name);
  // Ids used to be slug(key), so 'missouri_st' rendered as 'missouri-st'. Any
  // link or tool still holding the old form gets a zero-height alias element
  // at the same position, so getElementById() on it keeps working.
  const uniLegacy = slug(uniSlug);
  const alias = (id) => uniLegacy === uniSlug ? '' : `<span class="anchor-alias" id="${{id}}"></span>`;
  let html = alias(uniLegacy) + `<h2 id="${{uniSlug}}">${{esc(uni.name)}} <span class="uni-nra">IPEDS NRA: ${{uni.nra}}%</span><a class="share-anchor" href="#${{uniSlug}}" onclick="shareAnchor('${{uniSlug}}',event);return false;" title="Copy link to ${{esc(uni.name)}}" aria-label="Copy link to ${{esc(uni.name)}}">#</a></h2>`;
  html += `<div class="uni-stats">${{allTotal.toLocaleString()}} records across ${{depts.length}} departments &middot; ${{statsParts.join(' &middot; ')}}`;
  if (originParts.length > 0) html += `<span class="uni-origin-stats"> &middot; ${{originParts.join(' &middot; ')}}</span>`;
  html += `${{repoLink}}</div>`;
  html += `<div style="margin:8px 0 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><button onclick="expandAllDepts()" style="background:var(--surface);border:1px solid var(--surface2);color:var(--text-muted);font-size:0.72rem;padding:3px 10px;border-radius:5px;cursor:pointer;">Expand All Departments</button><button onclick="collapseAllDepts()" style="background:var(--surface);border:1px solid var(--surface2);color:var(--text-muted);font-size:0.72rem;padding:3px 10px;border-radius:5px;cursor:pointer;">Collapse All</button><button id="share-btn" onclick="shareLink()" style="background:none;border:none;color:var(--accent);font-size:0.72rem;font-weight:700;cursor:pointer;margin-left:auto;opacity:0.4;transition:opacity 0.15s;" onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='0.4'" title="Copy link to this view (university plus any open panels)">Copy link</button></div>`;

  let deptIdx = 0;
  depts.forEach(d => {{
    const isGeneral = d.dept.toLowerCase() === 'general' || d.dept.toLowerCase().endsWith('(general)');
    // Group by year
    const byYear = {{}};
    d.recs.forEach(r => {{
      const yr = r[1];
      if (!byYear[yr]) byYear[yr] = [];
      byYear[yr].push(r);
    }});

    let yearHtml = '';
    Object.keys(byYear).sort((a, b) => b - a).forEach(yr => {{
      const yrRecs = byYear[yr].sort((a, b) => a[2].localeCompare(b[2]));

      // Split into PhD/unlabeled vs MS
      const phdRecs = yrRecs.filter(r => r[7] !== 'ms');
      const msRecs = yrRecs.filter(r => r[7] === 'ms');

      // Stats for PhD/unlabeled group
      const yrCounts = {{}};
      ORIGIN_KEYS.forEach(o => yrCounts[o] = 0);
      phdRecs.forEach(r => {{ if (ORIGINS[r[3]]) yrCounts[r[3]]++; }});
      const yrClassified = ORIGIN_KEYS.reduce((s, o) => s + yrCounts[o], 0);
      const yrPct = phdRecs.length ? yrClassified / phdRecs.length * 100 : 0;

      let yrBadge = [];
      ORIGIN_KEYS.forEach(o => {{
        if (yrCounts[o] > 0) {{ const [flag] = ORIGINS[o]; yrBadge.push(`${{flag}}${{yrCounts[o]}}`); }}
      }});
      const pctClass = yrPct >= 40 ? 'pct-high' : yrPct >= 20 ? 'pct-med' : '';

      // Skip years where only MS records exist and no PhD/unlabeled (to avoid "0 dissertations" clutter)
      if (phdRecs.length === 0 && msRecs.length > 0) {{
        // Only MS records — render a compact year entry that's only visible when MS toggle is on
        const msRows = buildNameRows(msRecs);
        yearHtml += `<div class="year-block ms-group" id="${{uniSlug}}--${{yr}}">${{alias(uniLegacy + '--' + yr)}}<div class="year-header" onclick="this.parentElement.classList.toggle('yr-collapsed')"><span class="year-toggle">\u25bc</span><span style="color:var(--accent);font-weight:700">${{yr}}</span>&nbsp;&nbsp;${{msRecs.length}} master's ${{msRecs.length !== 1 ? 'theses' : 'thesis'}}<a class="share-anchor" href="#${{uniSlug}}--${{yr}}" onclick="shareAnchor('${{uniSlug}}--${{yr}}',event);return false;" title="Copy link to ${{yr}} master's theses" aria-label="Copy link to ${{yr}} master's theses">#</a></div><div class="year-names">${{msRows}}</div></div>`;
        return;
      }}

      // Build year header label
      let headerLabel = `${{phdRecs.length}} dissertation${{phdRecs.length !== 1 ? 's' : ''}}`;
      if (msRecs.length > 0) headerLabel += `<span class="year-ms-note"> and ${{msRecs.length}} master's ${{msRecs.length !== 1 ? 'theses' : 'thesis'}}</span>`;

      function buildNameRows(recs) {{
        let rows = '';
        recs.forEach(r => {{
          const b = badge(r[3]);
          const db = degreeBadge(r[7]);
          const titleEsc = esc(r[5]);
          const nameEl = r[6]
            ? `<a href="${{r[6]}}" target="_blank" class="name-link">${{esc(r[2])}}</a>`
            : `<span class="name-nolink">${{esc(r[2])}}</span>`;
          rows += `<div class="name-row"><div class="name-col">${{db}}${{b}}${{nameEl}}</div><div class="title-col" title="${{titleEsc}}">${{titleEsc}}</div></div>`;
        }});
        return rows;
      }}

      let namesHtml = buildNameRows(phdRecs);

      if (msRecs.length > 0) {{
        const msCounts = {{}};
        ORIGIN_KEYS.forEach(o => msCounts[o] = 0);
        msRecs.forEach(r => {{ if (ORIGINS[r[3]]) msCounts[r[3]]++; }});
        const msClassified = ORIGIN_KEYS.reduce((s, o) => s + msCounts[o], 0);

        let msBadge = [];
        ORIGIN_KEYS.forEach(o => {{
          if (msCounts[o] > 0) {{ const [flag] = ORIGINS[o]; msBadge.push(`${{flag}}${{msCounts[o]}}`); }}
        }});

        namesHtml += `<div class="ms-group"><div class="ms-group-header" onclick="this.parentElement.classList.toggle('collapsed')"><span class="dept-toggle">\u25bc</span><span style="color:#fbbf24;font-weight:600;font-size:0.82rem;">${{msRecs.length}} Master's ${{msRecs.length !== 1 ? 'Theses' : 'Thesis'}}</span><span class="year-pct" style="font-size:0.78rem;margin-left:8px;">${{msBadge.join(' ')}} &mdash; ${{msClassified}}/${{msRecs.length}} classified</span></div><div class="ms-group-body">${{buildNameRows(msRecs)}}</div></div>`;
      }}

      const oldClass = parseInt(yr) < 2010 ? ' pre-2010' : '';
      const yrId = uniSlug + '--' + slug(d.dept) + '--' + yr;
      yearHtml += `<div class="year-block${{oldClass}}" id="${{yrId}}">${{alias(uniLegacy + '--' + slug(d.dept) + '--' + yr)}}<div class="year-header" onclick="this.parentElement.classList.toggle('yr-collapsed')"><span class="year-toggle">\u25bc</span><span class="year-label">${{yr}}</span><span class="year-count">${{headerLabel}}</span><a class="share-anchor" href="#${{yrId}}" onclick="shareAnchor('${{yrId}}',event);return false;" title="Copy link to ${{yr}}" aria-label="Copy link to ${{yr}}">#</a><span class="year-pct ${{pctClass}}">${{yrBadge.join(' ')}} &mdash; ${{yrClassified}}/${{phdRecs.length}} classified (${{yrPct.toFixed(0)}}%)</span></div><div class="year-names">${{namesHtml}}</div></div>`;
    }});

    // Dept header flags
    let deptBadge = [];
    ORIGIN_KEYS.forEach(o => {{
      if (d.stats[o] > 0) {{
        const [flag] = ORIGINS[o];
        deptBadge.push(`${{flag}}${{d.stats[o]}} (${{(d.stats[o]/d.stats.total*100).toFixed(0)}}%)`);
      }}
    }});
    const pctClass = d.stats.classifiedPct >= 30 ? 'pct-high' : d.stats.classifiedPct >= 20 ? 'pct-med' : '';
    // Expand first 5 non-General departments; General always collapsed
    const collapsed = (isGeneral || deptIdx >= 5) ? ' collapsed' : '';
    const generalClass = isGeneral ? ' dept-general' : '';
    // Auto-expand if department filter is active
    const deptFilterVal = window._activeDeptFilter || '';
    const filterExpand = deptFilterVal && d.dept === deptFilterVal ? '' : collapsed;
    const finalCollapsed = deptFilterVal ? filterExpand : collapsed;

    // Build department links if available
    const deptLinks = uni.dept_links && uni.dept_links[d.dept];
    let deptLinkHtml = '';
    if (deptLinks) {{
      if (deptLinks.home) deptLinkHtml += ` <a href="${{deptLinks.home}}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:0.75rem;text-decoration:none;" title="Department homepage">Dept</a>`;
      if (deptLinks.faculty) deptLinkHtml += ` <a href="${{deptLinks.faculty}}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:0.75rem;text-decoration:none;" title="Faculty directory">Faculty</a>`;
      if (deptLinks.students) deptLinkHtml += ` <a href="${{deptLinks.students}}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:0.75rem;text-decoration:none;" title="PhD student directory">Students</a>`;
      if (deptLinks.directory) deptLinkHtml += ` <a href="${{deptLinks.directory}}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:0.75rem;text-decoration:none;" title="Graduate student directory">Directory</a>`;
      if (deptLinks.repo_search) deptLinkHtml += ` <a href="${{deptLinks.repo_search}}" target="_blank" onclick="event.stopPropagation()" style="color:var(--accent);font-size:0.75rem;text-decoration:none;" title="Search repository for this department">Repo</a>`;
    }}

    const deptSlug = uniSlug + '--' + slug(d.dept);
    const yearControls = Object.keys(byYear).length > 2 ? `<div style="display:flex;gap:6px;margin-bottom:6px;"><button onclick="expandAllYears(this)" style="background:none;border:1px solid var(--surface2);color:var(--text-muted);font-size:0.68rem;padding:2px 8px;border-radius:4px;cursor:pointer;">Expand All Years</button><button onclick="collapseAllYears(this)" style="background:none;border:1px solid var(--surface2);color:var(--text-muted);font-size:0.68rem;padding:2px 8px;border-radius:4px;cursor:pointer;">Collapse Years</button></div>` : '';
    html += `<div class="dept-section${{finalCollapsed}}${{generalClass}}" id="${{deptSlug}}" data-dept="${{esc(d.dept)}}">${{alias(uniLegacy + '--' + slug(d.dept))}}<div class="dept-header" onclick="this.parentElement.classList.toggle('collapsed')"><span class="dept-toggle">\u25bc</span><span class="dept-name">${{esc(d.dept)}}</span>${{deptLinkHtml}}<span class="dept-stats">${{d.stats.total}} records</span><span class="dept-flags">${{deptBadge.join('  ')}}</span><span class="dept-pct ${{pctClass}}">${{d.stats.classifiedPct.toFixed(0)}}% classified</span><a class="share-anchor" href="#${{deptSlug}}" onclick="shareAnchor('${{deptSlug}}',event);return false;" title="Copy link to ${{esc(d.dept)}}" aria-label="Copy link to ${{esc(d.dept)}}">#</a></div><div class="dept-body">${{yearControls}}${{yearHtml}}</div></div>`;
    deptIdx++;
  }});

  return html;
}}

function toggleSidebar() {{
  document.getElementById('sidebar').classList.toggle('open');
}}

function toggleSidebarGroup(id) {{
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.toggle('collapsed');
  // Persist collapse state to localStorage (shared with sidebar.js).
  // Map sidebar-group IDs to the section titles used by sidebar.js.
  const map = {{ 'sg-national': 'National', 'sg-universities': 'Universities',
                'sg-international': 'International', 'sg-reference': 'Reference', 'sg-about': 'About' }};
  const section = map[id];
  if (!section) return;
  try {{
    const s = new Set(JSON.parse(localStorage.getItem('sb_collapsed') || '[]'));
    if (el.classList.contains('collapsed')) s.add(section);
    else s.delete(section);
    localStorage.setItem('sb_collapsed', JSON.stringify([...s]));
  }} catch (e) {{}}
}}

// On page load, restore collapse state from localStorage
(function() {{
  try {{
    const collapsed = new Set(JSON.parse(localStorage.getItem('sb_collapsed') || '[]'));
    const map = {{ 'National': 'sg-national', 'Universities': 'sg-universities',
                  'International': 'sg-international', 'Reference': 'sg-reference', 'About': 'sg-about' }};
    for (const section of collapsed) {{
      const el = document.getElementById(map[section]);
      if (el) el.classList.add('collapsed');
    }}
  }} catch (e) {{}}
}})();

function showUni(key, skipHash) {{
  // A university is being loaded, so the per-university toggles become
  // meaningful. Until this runs they are inert and are styled as such.
  document.body.classList.remove('no-uni');
  // Close mobile sidebar if open
  document.getElementById('sidebar').classList.remove('open');
  currentKey = key;
  // Picking a university from the sidebar addresses the university itself;
  // a deep link sets currentAnchor first and passes skipHash.
  if (!skipHash) {{ currentAnchor = key; updateUrlState(); }}
  // Update page title for browser tab + bookmarks
  const uniName = UNI_MAP[key] ? UNI_MAP[key].name : key;
  document.title = uniName + ' — PhD Demographics';
  document.getElementById('search').value = '';
  document.getElementById('search-results').style.display = 'none';

  document.querySelectorAll('.nav-item').forEach(a => {{
    a.classList.toggle('active', a.dataset.key === key);
  }});

  if (!UNI_MAP[key]) return;
  document.getElementById('info-section').style.display = 'none';
  destroyNationalCharts();

  // If already cached, render immediately
  if (UNI_CACHE[key]) {{
    window._currentUniData = UNI_CACHE[key];
    document.getElementById('content').innerHTML = renderUni(UNI_CACHE[key]);
    updateOldToggle();
    updateFundingChart();
    updateEnrollmentPanel();
    updateH1bPanel();
    consumePendingAnchor();
    return;
  }}

  // Show loading state, then fetch
  document.getElementById('content').innerHTML = '<p class="placeholder-msg">Loading...</p>';
  fetch(DATA_DIR + '/' + key + '.json')
    .then(r => r.json())
    .then(uni => {{
      UNI_CACHE[key] = uni;
      window._currentUniData = uni;
      // Only render if still the current selection
      if (currentKey === key) {{
        document.getElementById('content').innerHTML = renderUni(uni);
        updateOldToggle();
        updateFundingChart();
        updateEnrollmentPanel();
        updateH1bPanel();
        consumePendingAnchor();
      }}
    }})
    .catch(e => {{
      document.getElementById('content').innerHTML = '<p class="placeholder-msg">Error loading data: ' + e.message + '</p>';
    }});
}}

function toggleFlags() {{
  flagsVisible = !flagsVisible;
  document.getElementById('flag-toggle').classList.toggle('active', flagsVisible);
  document.body.classList.toggle('flags-hidden', !flagsVisible);
}}

function toggleMs() {{
  if (document.body.classList.contains('no-uni')) return;
  msVisible = !msVisible;
  const el = document.getElementById('ms-toggle');
  el.classList.toggle('active', msVisible);
  el.setAttribute('aria-checked', msVisible);
  document.body.classList.toggle('ms-hidden', !msVisible);
  updateUrlState();
}}

function toggleOld() {{
  oldVisible = !oldVisible;
  document.getElementById('old-toggle').classList.toggle('active', oldVisible);
  document.body.classList.toggle('old-hidden', !oldVisible);
}}

function toggleFunding() {{
  if (document.body.classList.contains('no-uni')) return;
  fundingVisible = !fundingVisible;
  const el = document.getElementById('funding-toggle');
  el.classList.toggle('active', fundingVisible);
  el.setAttribute('aria-checked', fundingVisible);
  updateFundingChart();
  updateUrlState();
}}

function toggleEnrollment() {{
  if (document.body.classList.contains('no-uni')) return;
  enrollmentVisible = !enrollmentVisible;
  const el = document.getElementById('enrollment-toggle');
  el.classList.toggle('active', enrollmentVisible);
  el.setAttribute('aria-checked', enrollmentVisible);
  updateEnrollmentPanel();
  updateUrlState();
}}

let h1bVisible = false;
const OPT_UNIS = new Set(["binghamton","bu","clemson","cmu","columbia","cornell","duke","gatech","gmu","harvard","iowa_state","missouri_st","mit","msu","ncstate","njit","northwestern","penn_state","purdue","rice","rit","smu","stanford","stony_brook","syracuse","ttu","ubuffalo","ucberkeley","ucdavis","ucf","ucirvine","ucla","ucriverside","ucsd","uf","uhouston","uiuc","umass","umd","umemphis","umissouri","umn","unt","upenn","usf","utarlington","utaustin","utdallas","uutah","uva","uw_seattle","uwmadison","vt","washu","wayne_state","yale"]);
document.querySelectorAll('.nav-item[data-key]').forEach(a => {{
  if (OPT_UNIS.has(a.dataset.key)) a.classList.add('has-opt');
}});
function toggleH1b() {{
  if (document.body.classList.contains('no-uni')) return;
  h1bVisible = !h1bVisible;
  const el = document.getElementById('h1b-toggle');
  el.classList.toggle('active', h1bVisible);
  el.setAttribute('aria-checked', h1bVisible);
  document.body.classList.toggle('h1b-active', h1bVisible);
  updateH1bPanel();
  updateUrlState();
}}

let h1bChart = null;
let optChart = null;
function updateH1bPanel() {{
  const container = document.getElementById('h1b-container');
  if (!h1bVisible || !currentKey) {{
    container.classList.remove('visible');
    return;
  }}
  const uni = window._currentUniData;
  if (!uni) return;
  container.classList.add('visible');

  // Pipeline summary
  const pipelineSummary = document.getElementById('h1b-pipeline-summary');
  const opt = uni.opt || {{}};
  const optYears = Object.keys(opt).sort();
  const latestOpt = optYears.length ? opt[optYears[optYears.length - 1]] : null;
  const h1bData = uni.h1b || [];
  const latestH1b = h1bData.length ? h1bData[h1bData.length - 1] : null;
  const perm = uni.perm;

  let pipelineHtml = '<strong style="color:var(--text);">Pipeline:</strong> ';
  const parts = [];
  if (latestOpt?.opt?.students_employed) {{
    parts.push(`<span style="color:var(--accent);">${{latestOpt.opt.students_employed.toLocaleString()}}</span> OPT students (CY${{optYears[optYears.length-1]}})`);
  }}
  if (latestOpt?.stem_opt?.students_employed) {{
    parts.push(`<span style="color:#a78bfa;">${{latestOpt.stem_opt.students_employed.toLocaleString()}}</span> on STEM OPT`);
  }}
  if (latestH1b) {{
    parts.push(`<span style="color:#38bdf8;">${{latestH1b[1].toLocaleString()}}</span> H-1B petitions (FY${{latestH1b[0]}})`);
  }}
  if (perm?.certified) {{
    parts.push(`<span style="color:#4ade80;">${{perm.certified}}</span> green card certifications`);
  }}
  if (parts.length > 0) {{
    pipelineHtml += parts.join(' &rarr; ');
    if (uni.h1b_system_note) {{
      pipelineHtml += `<br><span style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">Note: ${{uni.h1b_system_note}}</span>`;
    }}
    pipelineSummary.innerHTML = pipelineHtml;
    pipelineSummary.style.display = 'block';
  }} else {{
    pipelineSummary.style.display = 'none';
  }}

  // OPT trend chart
  const optCtx = document.getElementById('opt-chart');
  if (optChart) optChart.destroy();
  if (optYears.length > 1) {{
    const optVals = optYears.map(y => opt[y]?.opt?.students_employed || 0);
    const stemVals = optYears.map(y => opt[y]?.stem_opt?.students_employed || 0);
    optChart = new Chart(optCtx, {{
      type: 'line',
      data: {{
        labels: optYears.map(y => 'CY' + y),
        datasets: [
          {{ label: 'OPT (all)', data: optVals, borderColor: 'rgba(56,189,248,0.9)', backgroundColor: 'rgba(56,189,248,0.1)', fill: true, tension: 0.3, pointRadius: 3 }},
          {{ label: 'STEM OPT', data: stemVals, borderColor: 'rgba(167,139,250,0.9)', backgroundColor: 'rgba(167,139,250,0.1)', fill: true, tension: 0.3, pointRadius: 3 }},
        ]
      }},
      options: {{
        responsive: true,
        plugins: {{ legend: {{ labels: {{ color: '#94a3b8', font: {{ size: 11 }} }} }} }},
        scales: {{
          x: {{ ticks: {{ color: '#94a3b8', font: {{ size: 10 }} }}, grid: {{ display: false }} }},
          y: {{ ticks: {{ color: '#94a3b8' }}, grid: {{ color: 'rgba(148,163,184,0.1)' }}, beginAtZero: true }},
        }},
      }},
    }});
  }} else {{
    optCtx.getContext('2d').clearRect(0, 0, optCtx.width, optCtx.height);
  }}
  // Show empty-state HTML overlay whenever the chart cannot render a trend
  let optEmpty = document.getElementById('opt-empty-state');
  if (optYears.length < 2) {{
    if (!optEmpty) {{
      optEmpty = document.createElement('div');
      optEmpty.id = 'opt-empty-state';
      optEmpty.style.cssText = 'padding:24px 12px;text-align:center;color:var(--text-muted);font-size:0.8rem;line-height:1.6;background:rgba(148,163,184,0.04);border:1px dashed rgba(148,163,184,0.2);border-radius:6px;margin-top:8px;min-height:160px;display:flex;flex-direction:column;justify-content:center;';
      optCtx.parentElement.appendChild(optEmpty);
    }}
    if (optYears.length === 0) {{
      optEmpty.innerHTML = '<div style="font-weight:700;letter-spacing:0.04em;color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin-bottom:8px;">Data Not Available</div><div>OPT data is only published for the SEVP Top 100 schools (<a href="https://studyinthestates.dhs.gov/sevis-by-the-numbers" target="_blank" style="color:var(--accent);text-decoration:none;">ICE/SEVP SEVIS By the Numbers</a>, CY2017-2024). This university is not in that ranking.</div>';
    }} else {{
      const y = optYears[0];
      const o = opt[y]?.opt?.students_employed || 0;
      const s = opt[y]?.stem_opt?.students_employed || 0;
      optEmpty.innerHTML = `<div style="font-weight:700;letter-spacing:0.04em;color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin-bottom:8px;">Insufficient Data for Trend</div><div>Only one year (CY${{y}}) of <a href="https://studyinthestates.dhs.gov/sevis-by-the-numbers" target="_blank" style="color:var(--accent);text-decoration:none;">SEVP</a> reporting available: ${{o.toLocaleString()}} OPT, ${{s.toLocaleString()}} STEM OPT students employed.</div>`;
    }}
    optCtx.style.display = 'none';
  }} else if (optEmpty) {{
    optEmpty.remove();
    optCtx.style.display = '';
  }}

  // H-1B chart
  const ctx = document.getElementById('h1b-chart');
  if (h1bChart) h1bChart.destroy();
  if (h1bData.length > 0) {{
    const labels = h1bData.map(d => 'FY' + d[0]);
    const approvals = h1bData.map(d => d[1]);
    const denials = h1bData.map(d => d[2]);
    h1bChart = new Chart(ctx, {{
      type: 'bar',
      data: {{
        labels,
        datasets: [
          {{ label: 'Approvals', data: approvals, backgroundColor: 'rgba(56,189,248,0.7)', borderRadius: 3 }},
          {{ label: 'Denials', data: denials, backgroundColor: 'rgba(248,113,113,0.7)', borderRadius: 3 }},
        ]
      }},
      options: {{
        responsive: true,
        plugins: {{ legend: {{ labels: {{ color: '#94a3b8', font: {{ size: 11 }} }} }} }},
        scales: {{
          x: {{ stacked: true, ticks: {{ color: '#94a3b8', font: {{ size: 10 }} }}, grid: {{ display: false }} }},
          y: {{ stacked: true, ticks: {{ color: '#94a3b8' }}, grid: {{ color: 'rgba(148,163,184,0.1)' }} }},
        }},
      }},
    }});
  }} else {{
    ctx.getContext('2d').clearRect(0, 0, ctx.width, ctx.height);
  }}
  // H-1B empty state
  let h1bEmpty = document.getElementById('h1b-empty-state');
  if (h1bData.length === 0) {{
    if (!h1bEmpty) {{
      h1bEmpty = document.createElement('div');
      h1bEmpty.id = 'h1b-empty-state';
      h1bEmpty.style.cssText = 'padding:24px 12px;text-align:center;color:var(--text-muted);font-size:0.8rem;line-height:1.6;background:rgba(148,163,184,0.04);border:1px dashed rgba(148,163,184,0.2);border-radius:6px;margin-top:8px;min-height:160px;display:flex;flex-direction:column;justify-content:center;';
      ctx.parentElement.appendChild(h1bEmpty);
    }}
    h1bEmpty.innerHTML = '<div style="font-weight:700;letter-spacing:0.04em;color:var(--text-muted);text-transform:uppercase;font-size:0.75rem;margin-bottom:8px;">Data Not Available</div><div>No H-1B petitions filed under this university\\'s legal entity name in the <a href="https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub" target="_blank" style="color:var(--accent);text-decoration:none;">USCIS Employer Data Hub</a> (FY2010-FY2026). The university may file under a different legal name or use a separate health-system entity.</div>';
    ctx.style.display = 'none';
  }} else if (h1bEmpty) {{
    h1bEmpty.remove();
    ctx.style.display = '';
  }}

  // LCA + PERM details
  const details = document.getElementById('h1b-details');
  let html = '';

  // LCA top job titles
  const lca = uni.lca;
  if (lca && lca.top_titles && lca.top_titles.length > 0) {{
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">';
    const tw = lca.title_wages || {{}};
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:8px;">';
    html += '<tr style="border-bottom:1px solid var(--surface2);"><th style="text-align:left;padding:3px 6px;font-size:0.72rem;">Job Title</th><th style="text-align:right;padding:3px 6px;font-size:0.72rem;">Count</th><th style="text-align:right;padding:3px 6px;font-size:0.72rem;">Median</th><th style="text-align:right;padding:3px 6px;font-size:0.72rem;">Min</th><th style="text-align:right;padding:3px 6px;font-size:0.72rem;">Max</th></tr>';
    for (const [title, count] of lca.top_titles.slice(0, 7)) {{
      const w = tw[title];
      const median = w ? '$' + w.median.toLocaleString() : '';
      const min = w ? '$' + w.min.toLocaleString() : '';
      const max = w ? '$' + w.max.toLocaleString() : '';
      html += `<tr><td style="padding:2px 6px;font-size:0.78rem;">${{title}}</td><td style="text-align:right;padding:2px 6px;color:var(--accent);">${{count}}</td><td style="text-align:right;padding:2px 6px;font-size:0.75rem;">${{median}}</td><td style="text-align:right;padding:2px 6px;font-size:0.75rem;color:var(--text-muted);">${{min}}</td><td style="text-align:right;padding:2px 6px;font-size:0.75rem;color:var(--text-muted);">${{max}}</td></tr>`;
    }}
    html += '</table>';
    if (lca.wage_median) {{
      html += `<div style="font-size:0.78rem;margin-bottom:8px;">Overall median salary: <strong>$${{lca.wage_median.toLocaleString()}}</strong> (25th: $${{lca.wage_25th.toLocaleString()}}, 75th: $${{lca.wage_75th.toLocaleString()}})</div>`;
    }}
  }}

  // PERM green card data
  if (perm && perm.total > 0) {{
    const denied = perm.denied || 0;
    const certPct = perm.total > 0 ? Math.round(100 * (perm.certified || 0) / perm.total) : 0;
    html += `<div style="font-size:0.78rem;padding:6px 0;border-top:1px solid var(--surface2);">`;
    html += `<strong>Green Card Sponsorship</strong> (<a href="https://www.dol.gov/agencies/eta/foreign-labor/performance" target="_blank" style="color:var(--accent);text-decoration:none;">DOL PERM</a>): `;
    html += `<span style="color:#4ade80;">${{perm.certified}} certified</span>`;
    if (denied > 0) html += ` &middot; <span style="color:#f87171;">${{denied}} denied</span>`;
    html += ` &middot; ${{perm.total}} total (${{certPct}}% approval)`;
    if (perm.top_titles?.length) {{
      html += `<br>Top roles: ${{perm.top_titles.map(t => t[0]).join(', ')}}`;
    }}
    html += '</div>';
  }}

  // LCA SOC code distribution
  if (lca && lca.top_soc && lca.top_soc.length > 0) {{
    html += `<div style="font-size:0.78rem;padding:6px 0;border-top:1px solid var(--surface2);">`;
    html += `<strong>Top Occupation Categories</strong> (<a href="https://www.dol.gov/agencies/eta/foreign-labor/performance" target="_blank" style="color:var(--accent);text-decoration:none;">DOL LCA SOC</a>): `;
    const socList = lca.top_soc.slice(0, 5).map(s => `${{s[0]}} <span style="color:var(--text-muted);">(${{s[1].toLocaleString()}})</span>`).join(', ');
    html += socList;
    html += '</div>';
  }}

  // LCA yearly trend
  if (lca && lca.yearly && Object.keys(lca.yearly).length > 1) {{
    const years = Object.keys(lca.yearly).sort();
    const vals = years.map(y => lca.yearly[y]);
    const peak = Math.max(...vals);
    const peakYear = years[vals.indexOf(peak)];
    const latest = vals[vals.length - 1];
    const latestYear = years[years.length - 1];
    html += `<div style="font-size:0.78rem;padding:6px 0;border-top:1px solid var(--surface2);">`;
    html += `<strong>LCA Filings Over Time:</strong> peaked at <span style="color:var(--accent);">${{peak.toLocaleString()}}</span> in ${{peakYear}}, currently <span style="color:var(--accent);">${{latest.toLocaleString()}}</span> (${{latestYear}})`;
    html += `<div style="display:flex;gap:2px;align-items:flex-end;height:40px;margin-top:6px;">`;
    for (let i = 0; i < years.length; i++) {{
      const h = peak > 0 ? Math.max(2, (vals[i] / peak) * 38) : 2;
      html += `<div title="${{years[i]}}: ${{vals[i].toLocaleString()}}" style="flex:1;background:rgba(56,189,248,0.6);height:${{h}}px;min-width:6px;"></div>`;
    }}
    html += `</div>`;
    html += `<div style="display:flex;justify-content:space-between;font-size:0.65rem;color:var(--text-muted);margin-top:2px;"><span>${{years[0]}}</span><span>${{years[years.length-1]}}</span></div>`;
    html += '</div>';
  }}

  if (!html && !optYears.length && !h1bData.length) {{
    html = '<div style="color:var(--text-muted);padding:20px;">No H-1B or OPT data available for this university.</div>';
  }}
  details.innerHTML = html;
}}

function updateEnrollmentPanel() {{
  const container = document.getElementById('enrollment-container');
  if (!enrollmentVisible || !currentKey) {{
    container.classList.remove('visible');
    return;
  }}

  const uni = UNI_CACHE[currentKey];
  if (!uni || !uni.enrollment) {{
    container.classList.remove('visible');
    return;
  }}
  container.classList.add('visible');

  const enr = uni.enrollment;
  const trend = uni.completions_trend;

  // Title
  document.getElementById('enrollment-title').textContent = uni.name + ' — Graduate Enrollment & PhD Trend';

  // Stats summary
  const statsEl = document.getElementById('enrollment-stats');
  const foreignPct = enr.foreign_pct || 0;
  const docForeignPct = enr.doctoral_total ? ((enr.doctoral_foreign / enr.doctoral_total) * 100).toFixed(0) : '?';
  const maForeignPct = enr.masters_total ? ((enr.masters_foreign / enr.masters_total) * 100).toFixed(0) : '?';

  const tuit = uni.tuition || {{}};
  const aid = uni.financial_aid || {{}};
  const fac = uni.faculty || {{}};

  let html = `<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:0.82rem;margin-bottom:8px;">
    <div><span style="font-size:1.3rem;font-weight:700;color:var(--text);">${{enr.total_grad?.toLocaleString() || '?'}}</span><br><span style="color:var(--text-muted);">Total Grad Students</span></div>
    <div><span style="font-size:1.3rem;font-weight:700;color:#f87171;">${{foreignPct}}%</span><br><span style="color:var(--text-muted);">Temporary Visa Holders</span></div>
    <div><span style="font-size:1.3rem;font-weight:700;color:#4ade80;">${{enr.doctoral_total?.toLocaleString() || '?'}}</span><br><span style="color:var(--text-muted);">Doctoral (${{docForeignPct}}% foreign)</span></div>
    <div><span style="font-size:1.3rem;font-weight:700;color:#fbbf24;">${{enr.masters_total?.toLocaleString() || '?'}}</span><br><span style="color:var(--text-muted);">Master's (${{maForeignPct}}% foreign)</span></div>
  </div>`;

  // Second row: tuition, aid, faculty
  let row2 = [];
  if (tuit.outstate > 0) {{
    const instate = tuit.instate ? `$${{(tuit.instate/1000).toFixed(0)}}K in-state` : '';
    row2.push(`<div><span style="font-size:1rem;font-weight:600;color:var(--text);">$${{(tuit.outstate/1000).toFixed(0)}}K</span><br><span style="color:var(--text-muted);">Grad Tuition (out-of-state)${{instate ? '<br>' + instate : ''}}</span></div>`);
  }}
  if (aid.grant_total > 0) {{
    const pctAided = aid.grad_students > 0 ? ((aid.receiving_grants / aid.grad_students) * 100).toFixed(0) : '?';
    const fedShare = aid.fed_grant_total && aid.grant_total > 0 ? Math.round(100 * aid.fed_grant_total / aid.grant_total) : 0;
    const fedNote = aid.fed_grant_total > 0 ? `<br>Federal share: $${{(aid.fed_grant_total/1e6).toFixed(1)}}M (${{fedShare}}%)` : '';
    const avgNote = aid.grant_avg ? `<br>Avg: $${{aid.grant_avg.toLocaleString()}}` : '';
    row2.push(`<div><span style="font-size:1rem;font-weight:600;color:var(--text);">$${{(aid.grant_total/1e6).toFixed(1)}}M</span><br><span style="color:var(--text-muted);">Grad Grants (${{pctAided}}% receive aid)${{fedNote}}${{avgNote}}</span></div>`);
  }}
  if (fac.total > 0) {{
    row2.push(`<div><span style="font-size:1rem;font-weight:600;color:var(--text);">${{fac.total.toLocaleString()}}</span><br><span style="color:var(--text-muted);">Faculty (${{fac.nra_pct}}% NRA)</span></div>`);
  }}
  if (row2.length > 0) {{
    html += `<div style="display:flex;gap:20px;flex-wrap:wrap;font-size:0.82rem;margin-top:6px;padding-top:6px;border-top:1px solid var(--surface2);">${{row2.join('')}}</div>`;
  }}

  statsEl.innerHTML = html;

  // Field bar chart — top fields by foreign enrollment
  const fields = enr.by_field || [];
  if (fields.length > 0 && document.getElementById('enrollment-field-chart')) {{
    if (enrollmentFieldChart) enrollmentFieldChart.destroy();
    const ctx = document.getElementById('enrollment-field-chart').getContext('2d');
    const topFields = fields.slice(0, 10);
    enrollmentFieldChart = new Chart(ctx, {{
      type: 'bar',
      data: {{
        labels: topFields.map(f => f.field.length > 30 ? f.field.substring(0, 28) + '...' : f.field),
        datasets: [
          {{ label: 'Foreign', data: topFields.map(f => f.foreign), backgroundColor: '#f87171' }},
          {{ label: 'US Domestic', data: topFields.map(f => f.total - f.foreign), backgroundColor: '#38bdf8' }},
        ]
      }},
      options: {{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{ legend: {{ position: 'bottom', labels: {{ color: '#94a3b8', font: {{ size: 10 }} }} }} }},
        scales: {{
          x: {{ stacked: true, ticks: {{ color: '#64748b', font: {{ size: 10 }} }}, grid: {{ color: '#1e293b' }} }},
          y: {{ stacked: true, ticks: {{ color: '#94a3b8', font: {{ size: 10 }} }}, grid: {{ display: false }} }}
        }}
      }}
    }});
  }}

  // Completions trend chart — show STEM if available, otherwise all fields
  if (trend && trend.years && trend.years.length > 0 && document.getElementById('completions-trend-chart')) {{
    if (completionsTrendChart) completionsTrendChart.destroy();
    const ctx2 = document.getElementById('completions-trend-chart').getContext('2d');

    // Prefer STEM-only data if available, OR show non-STEM (total - STEM) on non-STEM page
    const hasStem = trend.phd_stem_total && trend.phd_stem_total.some(v => v > 0);
    let totals, nras, chartLabel;
    if (IS_NONSTEM && hasStem) {{
      // Non-STEM = total minus STEM, computed per year
      totals = trend.phd_total.map((t, i) => Math.max(0, (t || 0) - (trend.phd_stem_total[i] || 0)));
      nras = trend.phd_nra.map((n, i) => Math.max(0, (n || 0) - (trend.phd_stem_nra[i] || 0)));
      chartLabel = 'Non-STEM PhD Completions (IPEDS)';
    }} else if (hasStem) {{
      totals = trend.phd_stem_total;
      nras = trend.phd_stem_nra;
      chartLabel = 'STEM PhD Completions (IPEDS)';
    }} else {{
      totals = trend.phd_total;
      nras = trend.phd_nra;
      chartLabel = 'PhD Completions — All Fields (IPEDS)';
    }}

    // Update panel title
    document.querySelector('#enrollment-container .funding-panels > div:last-child > div:first-child').innerHTML =
      chartLabel + ' <a href="https://nces.ed.gov/ipeds/" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:400;font-size:0.8rem;">source</a>';

    const unknowns = trend.phd_unknown || totals.map(_ => 0);
    const domestic = totals.map((t, i) => Math.max(0, t - (nras[i] || 0) - (unknowns[i] || 0)));
    const hasUnknowns = unknowns.some(v => v > 0);
    const datasets = [
      {{ label: 'Temporary Visa (NRA)', data: nras, borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,0.3)', fill: true, tension: 0.3, order: 1 }},
      {{ label: 'US Citizens + Perm Residents*', data: domestic, borderColor: '#38bdf8', backgroundColor: 'rgba(56,189,248,0.3)', fill: true, tension: 0.3, order: 2 }},
    ];
    if (hasUnknowns) {{
      datasets.push({{ label: 'Citizenship Unreported', data: unknowns, borderColor: '#94a3b8', backgroundColor: 'rgba(148,163,184,0.3)', fill: true, tension: 0.3, order: 3 }});
    }}
    completionsTrendChart = new Chart(ctx2, {{
      type: 'line',
      data: {{
        labels: trend.years,
        datasets: datasets,
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{
          legend: {{ position: 'bottom', labels: {{ color: '#94a3b8', font: {{ size: 10 }} }} }},
          tooltip: {{ callbacks: {{
            afterBody: function(items) {{
              const idx = items[0].dataIndex;
              const t = totals[idx], n = nras[idx];
              return `NRA: ${{n}} of ${{t}} (${{(n/t*100).toFixed(0)}}%)`;
            }}
          }} }}
        }},
        scales: {{
          x: {{ ticks: {{ color: '#64748b', font: {{ size: 10 }} }}, grid: {{ color: '#1e293b' }}, stacked: true }},
          y: {{ ticks: {{ color: '#64748b', font: {{ size: 10 }} }}, grid: {{ color: '#1e293b' }}, beginAtZero: true, stacked: true }}
        }}
      }}
    }});
  }}

  // IPEDS self-reported race/citizenship horizontal stacked bar
  const ipedsRow = document.getElementById('enrollment-race-row');
  const ipedsLegend = document.getElementById('enrollment-race-legend');
  const ipedsCanvas = document.getElementById('enrollment-race-chart');
  if (enrollmentRaceChart) {{ enrollmentRaceChart.destroy(); enrollmentRaceChart = null; }}
  const ie = uni.enrollment_ipeds;
  if (ie && ie.total_grad > 0) {{
    ipedsRow.style.display = '';
    const cats = [
      {{ key: 'nra', label: 'Nonresident Alien', color: '#f87171' }},
      {{ key: 'white', label: 'White', color: '#e2e8f0' }},
      {{ key: 'asian', label: 'Asian', color: '#38bdf8' }},
      {{ key: 'hispanic', label: 'Hispanic / Latino', color: '#facc15' }},
      {{ key: 'black', label: 'Black / African American', color: '#a78bfa' }},
    ];
    const known = cats.reduce((s, c) => s + (ie[c.key] || 0), 0);
    const other = Math.max(0, ie.total_grad - known);
    cats.push({{ key: 'other', label: 'Other / Unknown', color: '#64748b' }});
    ie.other = other;
    const total = ie.total_grad;
    const data = cats.map(c => ie[c.key] || 0);
    const pcts = data.map(v => (v / total) * 100);
    enrollmentRaceChart = new Chart(ipedsCanvas.getContext('2d'), {{
      type: 'bar',
      data: {{
        labels: [''],
        datasets: cats.map((c, i) => ({{
          label: c.label,
          data: [pcts[i]],
          backgroundColor: c.color,
          borderWidth: 0,
          stack: 's',
          rawCount: data[i],
        }})),
      }},
      options: {{
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{
          legend: {{ display: false }},
          tooltip: {{
            callbacks: {{
              label: function(item) {{
                const c = item.dataset.rawCount;
                return `${{item.dataset.label}}: ${{c.toLocaleString()}} (${{item.parsed.x.toFixed(1)}}%)`;
              }}
            }}
          }}
        }},
        scales: {{
          x: {{ stacked: true, max: 100, ticks: {{ color: '#94a3b8', callback: v => v + '%' }}, grid: {{ color: 'rgba(148,163,184,0.08)' }} }},
          y: {{ stacked: true, display: false }},
        }},
      }},
    }});
    ipedsLegend.innerHTML = cats.map((c, i) =>
      `<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:11px;height:11px;background:${{c.color}};border-radius:2px;"></span>${{c.label}} <span style="color:#94a3b8;">${{data[i].toLocaleString()}} (${{pcts[i].toFixed(1)}}%)</span></span>`
    ).join('');
  }} else {{
    ipedsRow.style.display = 'none';
  }}

  // Faculty IPEDS race breakdown — same shape as enrollment_ipeds, plotted in faculty-race-row
  const facRow = document.getElementById('faculty-race-row');
  const facLegend = document.getElementById('faculty-race-legend');
  const facCanvas = document.getElementById('faculty-race-chart');
  if (facultyRaceChart) {{ facultyRaceChart.destroy(); facultyRaceChart = null; }}
  if (fac && fac.total > 0) {{
    facRow.style.display = '';
    const facCats = [
      {{ key: 'nra', label: 'Nonresident Alien', color: '#f87171' }},
      {{ key: 'white', label: 'White', color: '#e2e8f0' }},
      {{ key: 'asian', label: 'Asian', color: '#38bdf8' }},
      {{ key: 'hispanic', label: 'Hispanic / Latino', color: '#facc15' }},
      {{ key: 'black', label: 'Black / African American', color: '#a78bfa' }},
    ];
    const facKnown = facCats.reduce((s, c) => s + (fac[c.key] || 0), 0);
    const facOther = Math.max(0, fac.total - facKnown);
    facCats.push({{ key: 'other', label: 'Other / Unknown', color: '#64748b' }});
    fac.other = facOther;
    const facTotal = fac.total;
    const facData = facCats.map(c => fac[c.key] || 0);
    const facPcts = facData.map(v => (v / facTotal) * 100);
    facultyRaceChart = new Chart(facCanvas.getContext('2d'), {{
      type: 'bar',
      data: {{
        labels: [''],
        datasets: facCats.map((c, i) => ({{
          label: c.label, data: [facPcts[i]], backgroundColor: c.color, borderWidth: 0, stack: 's', rawCount: facData[i],
        }})),
      }},
      options: {{
        indexAxis: 'y', responsive: true, maintainAspectRatio: false,
        plugins: {{
          legend: {{ display: false }},
          tooltip: {{ callbacks: {{ label: function(item) {{ const c = item.dataset.rawCount; return `${{item.dataset.label}}: ${{c.toLocaleString()}} (${{item.parsed.x.toFixed(1)}}%)`; }} }} }}
        }},
        scales: {{
          x: {{ stacked: true, max: 100, ticks: {{ color: '#94a3b8', callback: v => v + '%' }}, grid: {{ color: 'rgba(148,163,184,0.08)' }} }},
          y: {{ stacked: true, display: false }},
        }},
      }},
    }});
    facLegend.innerHTML = facCats.map((c, i) =>
      `<span style="display:flex;align-items:center;gap:6px;"><span style="display:inline-block;width:11px;height:11px;background:${{c.color}};border-radius:2px;"></span>${{c.label}} <span style="color:#94a3b8;">${{facData[i].toLocaleString()}} (${{facPcts[i].toFixed(1)}}%)</span></span>`
    ).join('');
  }} else {{
    facRow.style.display = 'none';
  }}

  // Add footnote about green card holders
  const footnoteId = 'enrollment-footnote';
  let footnote = document.getElementById(footnoteId);
  if (!footnote) {{
    footnote = document.createElement('div');
    footnote.id = footnoteId;
    footnote.style.cssText = 'font-size:0.72rem;color:var(--text-muted);margin-top:10px;line-height:1.5;padding:0 4px;';
    document.getElementById('enrollment-container').appendChild(footnote);
  }}
  const unknownTotal = trend && trend.phd_unknown ? trend.phd_unknown[trend.phd_unknown.length - 1] : 0;
  footnote.innerHTML = `*"US Citizens + Perm Residents" includes <strong>permanent residents (green card holders)</strong>, naturalized citizens, and DACA recipients — not just US-born citizens. ` +
    `An unknown number of students in this category are foreign-born with green cards. ` +
    (unknownTotal > 0 ? `${{unknownTotal}} students had unknown/unreported citizenship status in the most recent year. ` : '') +
    `<br>Source: <a href="https://nces.ed.gov/ipeds/" style="color:var(--accent);text-decoration:none;">IPEDS Completions Survey</a>, doctoral research degrees (AWLEVEL=17).`;
}}

function fmtDollars(n) {{
  if (n >= 1e9) return `$${{(n/1e9).toFixed(1)}}B`;
  if (n >= 1e6) return `$${{(n/1e6).toFixed(0)}}M`;
  if (n >= 1e3) return `$${{(n/1e3).toFixed(0)}}K`;
  return `$${{n}}`;
}}

function updateFundingChart() {{
  try {{
  const container = document.getElementById('funding-chart-container');
  if (!fundingVisible || !currentKey || !FUNDING[currentKey]) {{
    container.classList.remove('visible');
    return;
  }}
  container.classList.add('visible');
  const fdata = FUNDING[currentKey];
  const yearly = fdata.yearly_rd_thousands || {{}};
  const years = Object.keys(yearly).sort();
  const values = years.map(y => yearly[y] / 1000);

  document.getElementById('funding-chart-title').textContent =
    `${{fdata.name}} — Funding & Revenue (HERD Rank #${{fdata.rank}})`;

  if (typeof Chart === 'undefined') return;
  if (fundingChart) fundingChart.destroy();
  const ctx = document.getElementById('funding-chart').getContext('2d');
  fundingChart = new Chart(ctx, {{
    type: 'line',
    data: {{
      labels: years,
      datasets: [{{
        label: 'Total R&D ($M)',
        data: values,
        borderColor: '#38bdf8',
        backgroundColor: 'rgba(56,189,248,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: 4,
        pointBackgroundColor: '#38bdf8',
      }}]
    }},
    options: {{
      responsive: true,
      plugins: {{
        legend: {{ display: false }},
        tooltip: {{
          callbacks: {{
            label: function(ctx) {{
              return `$${{ctx.parsed.y.toFixed(0)}}M`;
            }}
          }}
        }}
      }},
      scales: {{
        y: {{
          beginAtZero: true,
          ticks: {{ callback: v => `$${{v}}M`, color: '#94a3b8' }},
          grid: {{ color: 'rgba(51,65,85,0.5)' }},
        }},
        x: {{
          ticks: {{ color: '#94a3b8' }},
          grid: {{ display: false }},
        }}
      }}
    }}
  }});

  // IPEDS Finance breakdown - multi-year stacked chart
  const fb = document.getElementById('finance-breakdown');
  const series = fdata.ipeds_finance_series;
  if (!series || Object.keys(series).length === 0) {{
    fb.style.display = 'none';
    return;
  }}
  fb.style.display = '';

  const finYears = Object.keys(series).sort();
  const fedData = finYears.map(y => series[y].federal / 1e6);
  const stateData = finYears.map(y => series[y].state / 1e6);
  const tuitionData = finYears.map(y => series[y].tuition / 1e6);
  const otherData = finYears.map(y => Math.max(0, (series[y].total - series[y].federal - series[y].state - series[y].tuition)) / 1e6);
  const finLabels = finYears.map(y => `FY${{y}}`);

  if (typeof Chart === 'undefined') return;
  if (financeChart) financeChart.destroy();
  const ctx2 = document.getElementById('finance-chart').getContext('2d');
  financeChart = new Chart(ctx2, {{
    type: 'bar',
    data: {{
      labels: finLabels,
      datasets: [
        {{ label: 'Federal', data: fedData, backgroundColor: '#f87171', stack: 'rev' }},
        {{ label: 'State', data: stateData, backgroundColor: '#60a5fa', stack: 'rev' }},
        {{ label: 'Tuition', data: tuitionData, backgroundColor: '#4ade80', stack: 'rev' }},
        {{ label: 'Other (gifts, investment, hospitals, auxiliary, private grants)', data: otherData, backgroundColor: '#475569', stack: 'rev' }},
      ]
    }},
    options: {{
      responsive: true,
      plugins: {{
        legend: {{
          position: 'bottom',
          labels: {{ color: '#94a3b8', boxWidth: 12, padding: 10, font: {{ size: 11 }} }}
        }},
        tooltip: {{
          callbacks: {{
            label: function(ctx) {{
              const lbl = ctx.dataset.label.split(' (')[0];
              return `${{lbl}}: $${{ctx.parsed.y.toFixed(0)}}M`;
            }},
            afterBody: function(items) {{
              const idx = items[0].dataIndex;
              const yr = finYears[idx];
              const d = series[yr];
              let lines = [`\\nTotal: ${{fmtDollars(d.total)}}`, `Taxpayer (Federal+State): ${{fmtDollars(d.federal + d.state)}} (${{((d.federal+d.state)/d.total*100).toFixed(0)}}%)`];
              if (d.other > 0) {{
                lines.push(`\\nOther includes:`);
                if (d.other_gifts) lines.push(`  Gifts/Donations: ${{fmtDollars(d.other_gifts)}}`);
                if (d.other_investment) lines.push(`  Investment Income: ${{fmtDollars(d.other_investment)}}`);
                if (d.other_hospitals) lines.push(`  Hospitals: ${{fmtDollars(d.other_hospitals)}}`);
                if (d.other_auxiliary) lines.push(`  Auxiliary (housing, dining): ${{fmtDollars(d.other_auxiliary)}}`);
              }}
              return lines.join('\\n');
            }}
          }}
        }}
      }},
      scales: {{
        y: {{
          stacked: true,
          beginAtZero: true,
          ticks: {{ callback: v => `$${{v}}M`, color: '#94a3b8' }},
          grid: {{ color: 'rgba(51,65,85,0.5)' }},
        }},
        x: {{
          stacked: true,
          ticks: {{ color: '#94a3b8' }},
          grid: {{ display: false }},
        }}
      }}
    }}
  }});

  // Summary for most recent year
  const latestYr = finYears[finYears.length - 1];
  const latest = series[latestYr];
  const taxpayer = latest.federal + latest.state;
  const taxpayerPct = ((taxpayer / latest.total) * 100).toFixed(0);
  document.getElementById('finance-details').innerHTML =
    `In FY${{latestYr}}: <strong style="color:#f87171;">${{fmtDollars(taxpayer)}}</strong> of ${{fmtDollars(latest.total)}} total revenue (${{taxpayerPct}}%) came from <strong style="color:var(--text);">taxpayer funding</strong> (federal + state).`
    + `<br><span style="font-size:0.72rem;color:var(--text-muted);">"Other" includes gifts &amp; donations, investment income, hospital revenue, auxiliary enterprises (housing, dining), and private grants. Hover bars for details.</span>`;

  // SHEEO state appropriations context (state-level, not per-uni)
  try {{
    const uni = UNI_CACHE[currentKey];
    const sf = uni && uni.state_funding;
    const sfRow = document.getElementById('state-funding-row');
    const sfContent = document.getElementById('state-funding-content');
    if (sf && sf.yearly && Object.keys(sf.yearly).length > 0) {{
      const sfYears = Object.keys(sf.yearly).sort();
      const latestSF = sf.yearly[sfYears[sfYears.length - 1]];
      const oldestSF = sf.yearly[sfYears[0]];
      const totalLatest = latestSF.total_state_support || 0;
      const perFTE = latestSF.ed_approp_per_fte || 0;
      const studentShare = latestSF.student_share != null ? Math.round(latestSF.student_share * 100) : null;
      const growthPct = oldestSF.total_state_support > 0
        ? Math.round(100 * (totalLatest - oldestSF.total_state_support) / oldestSF.total_state_support)
        : null;
      let sfHtml = `In ${{sfYears[sfYears.length-1]}}, <strong style="color:var(--text);">${{sf.state_name}}</strong> spent <strong style="color:#facc15;">${{fmtDollars(totalLatest)}}</strong> total on public higher education `;
      sfHtml += `(<strong>$${{Math.round(perFTE).toLocaleString()}}</strong> per full-time-equivalent student). `;
      if (studentShare != null) sfHtml += `Students cover <strong>${{studentShare}}%</strong> of public-college costs via tuition. `;
      if (growthPct != null) sfHtml += `Total state support has changed <strong style="color:${{growthPct >= 0 ? '#4ade80' : '#f87171'}};">${{growthPct >= 0 ? '+' : ''}}${{growthPct}}%</strong> since ${{sfYears[0]}}.`;
      sfHtml += `<br><span style="font-size:0.7rem;color:var(--text-muted);">${{(uni.name || '').includes('U ') || (uni.name || '').includes('State') ? 'Applies to this public institution' : 'Context only — this is a state aggregate; private institutions do not receive state appropriations.'}}</span>`;
      sfContent.innerHTML = sfHtml;
      sfRow.style.display = '';
    }} else {{
      sfRow.style.display = 'none';
    }}

    // USAspending federal awards context
    const usa = uni && uni.usaspending;
    const usaRow = document.getElementById('usaspending-row');
    const usaContent = document.getElementById('usaspending-content');
    if (usa && usa.total_grants > 0) {{
      let usaHtml = `<strong style="color:var(--text);">${{fmtDollars(usa.total_grants)}}</strong> in federal grants and contracts in the most recent reporting period`;
      if (usa.rank) usaHtml += ` (rank #${{usa.rank}} nationally)`;
      usaHtml += `. <span style="font-size:0.7rem;color:var(--text-muted);">Source: USAspending.gov per-recipient totals across all federal agencies, including NIH, NSF, DoD, DoE, NASA, USDA.</span>`;
      usaContent.innerHTML = usaHtml;
      usaRow.style.display = 'block';
    }} else {{
      usaRow.style.display = 'none';
    }}

    // NSF and NIH grant obligations by year. Distinct from HERD above:
    // HERD is self-reported R&D spending, these are what the agencies
    // actually obligated.
    const nsfA = uni && uni.nsf_awards;
    const nihA = uni && uni.nih;
    const grantsRow = document.getElementById('grants-row');
    const nsfBy = (nsfA && nsfA.by_year) || {{}};
    const nihBy = (nihA && nihA.by_year) || {{}};
    const gyears = Array.from(new Set(Object.keys(nsfBy).concat(Object.keys(nihBy)))).sort();
    if (gyears.length && typeof Chart !== 'undefined') {{
      const nsfVals = gyears.map(y => ((nsfBy[y] || {{}}).total_obligated || 0) / 1e6);
      const nihVals = gyears.map(y => ((nihBy[y] || {{}}).total_dollars || 0) / 1e6);
      if (grantsChart) grantsChart.destroy();
      grantsChart = new Chart(document.getElementById('grants-chart').getContext('2d'), {{
        type: 'bar',
        data: {{
          labels: gyears,
          datasets: [
            {{ label: 'NSF ($M)', data: nsfVals, backgroundColor: 'rgba(56,189,248,0.75)', borderRadius: 4 }},
            {{ label: 'NIH ($M)', data: nihVals, backgroundColor: 'rgba(167,139,250,0.75)', borderRadius: 4 }}
          ]
        }},
        options: {{
          responsive: true,
          plugins: {{
            legend: {{ display: true, position: 'bottom' }},
            tooltip: {{ callbacks: {{ label: ctx => ctx.dataset.label.replace(' ($M)','') + ': $' + ctx.parsed.y.toLocaleString(undefined,{{maximumFractionDigits:1}}) + 'M' }} }}
          }},
          scales: {{ y: {{ beginAtZero: true, ticks: {{ callback: v => '$' + v + 'M' }} }} }}
        }}
      }});
      const parts = [];
      if (nsfA && nsfA.total_awards) parts.push(`${{nsfA.total_awards.toLocaleString()}} NSF awards totalling ${{fmtDollars(nsfA.total_obligated)}}`);
      if (nihA && nihA.total_grants) parts.push(`${{nihA.total_grants.toLocaleString()}} NIH grants totalling ${{fmtDollars(nihA.total_dollars)}}`);
      document.getElementById('grants-details').innerHTML = parts.join(' · ') +
        ' <span style="font-size:0.7rem;">Obligations reported by the funding agency, not institutional expenditure.</span>';
      grantsRow.style.display = 'block';
    }} else if (grantsRow) {{
      grantsRow.style.display = 'none';
    }}
  }} catch(e) {{ console.warn('State/USAspending context error:', e); }}
  }} catch(e) {{ console.warn('Funding chart error:', e); }}
}}

function updateOldToggle() {{
  // Show the pre-2010 toggle only if the current view has pre-2010 year blocks
  const hasPre2010 = document.querySelectorAll('#content .pre-2010').length > 0;
  const oldToggle = document.getElementById('old-toggle');
  if (oldToggle) oldToggle.style.display = hasPre2010 ? '' : 'none';
}}

function showNational() {{
  resetView();
  document.getElementById('sidebar').classList.remove('open');
}}

function resetView() {{
  currentKey = null;
  history.replaceState(null, '', location.pathname);
  document.getElementById('search').value = '';
  document.getElementById('search-results').style.display = 'none';
  document.querySelectorAll('.nav-item').forEach(a => a.classList.remove('active'));
  document.getElementById('content').innerHTML = '<p class="placeholder-msg">\u2190 Select a university from the sidebar to view its name lists.</p>';
  document.getElementById('info-section').style.display = '';
  const oldT = document.getElementById('old-toggle');
  if (oldT) oldT.style.display = 'none';
  document.getElementById('funding-chart-container').classList.remove('visible');
  document.getElementById('enrollment-container').classList.remove('visible');
  document.title = '{"Non-STEM " if is_nonstem else ""}Thesis & Dissertation Lists — High NRA Universities';
  initNationalCharts();
}}

function getRepoBase(uni) {{
  // Extract the base repository URL from the first record with a URL
  if (!uni.records) return null;
  for (const r of uni.records) {{
    if (r[6]) {{
      try {{
        const u = new URL(r[6]);
        return u.origin;
      }} catch(e) {{}}
    }}
  }}
  return null;
}}

function debounceSearch(q) {{
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => doSearch(q), 250);
}}

let searchIndex = null;
let searchIndexLoading = false;

function loadSearchIndex() {{
  if (searchIndex || searchIndexLoading) return;
  searchIndexLoading = true;
  fetch(DATA_DIR + '/_search.json')
    .then(r => r.json())
    .then(data => {{ searchIndex = data; searchIndexLoading = false; }})
    .catch(() => {{ searchIndexLoading = false; }});
}}

function doSearch(query) {{
  const q = query.toLowerCase().trim();
  const results = document.getElementById('search-results');
  const content = document.getElementById('content');

  if (!q || q.length < 2) {{
    if (currentKey && UNI_CACHE[currentKey]) {{
      content.innerHTML = renderUni(UNI_CACHE[currentKey]);
    }} else if (currentKey) {{
      showUni(currentKey, true);
    }} else {{
      content.innerHTML = '<p class="placeholder-msg">\u2190 Select a university from the sidebar.</p>';
    }}
    results.style.display = 'none';
    return;
  }}

  // Load search index if not ready
  if (!searchIndex) {{
    loadSearchIndex();
    results.style.display = 'block';
    results.textContent = 'Loading search index...';
    setTimeout(() => doSearch(query), 300);
    return;
  }}

  // Search the index: entries are [uniKey, name, dept, year]
  let hits = [];
  for (const entry of searchIndex) {{
    const text = (entry[1] + ' ' + entry[2]).toLowerCase();
    if (text.includes(q)) {{
      hits.push(entry);
      if (hits.length >= 200) break;
    }}
  }}

  results.style.display = 'block';
  if (hits.length === 0) {{
    results.textContent = 'No results found';
    content.innerHTML = '';
    return;
  }}

  results.textContent = hits.length >= 200
    ? `Showing first 200 results`
    : `${{hits.length}} results found`;

  // Group hits by university for nav highlighting
  const uniKeys = new Set(hits.map(h => h[0]));
  document.querySelectorAll('.nav-item').forEach(a => {{
    a.classList.toggle('active', uniKeys.has(a.dataset.key));
  }});

  // Render search results (name + dept + year + university)
  let html = '';
  hits.forEach(h => {{
    // h: [uniKey, name, dept, year]
    const uniName = UNI_MAP[h[0]] ? UNI_MAP[h[0]].name : h[0];
    html += `<div class="name-row"><div class="name-col"><a href="javascript:void(0)" class="name-link" onclick="showUni('${{h[0]}}')">${{esc(h[1])}}</a></div><div class="title-col">${{esc(uniName)}} &middot; ${{esc(h[2])}} &middot; ${{h[3]}}</div></div>`;
  }});
  content.innerHTML = html;
}}

// ===== Anchors: one addressing scheme for every part of this page =====
//
//   #<uni_key>                          a university            (#missouri_st)
//   #<uni_key>--<field>                 a department in it      (#missouri_st--chemistry)
//   #<uni_key>--<field>--<year>         one year of it          (#missouri_st--chemistry--2024)
//   #<uni_key>--<year>                  its master's block      (#missouri_st--2024)
//   #<uni_key>--funding                 the funding panel       (opens the panel)
//   #<uni_key>--enrollment              the enrollment panel
//   #<uni_key>--h1b                     the H-1B / OPT panel
//   #nat-phd, #nat-opt, ...             a national chart
//
// <uni_key> is the key used everywhere else on the site: the sidebar links,
// /universities/<key>.html, and data/stem/<key>.json. <field> is the
// department name lower-cased with every run of non-alphanumerics turned into
// a single hyphen. Resolution is forgiving — case, and '-' versus '_' in the
// university key, never matter, so older hyphenated links still land.
//
// Panel toggles ride along after the anchor: #<anchor>?funding=1&enrollment=1&h1b=1&ms=1

const PANEL_ANCHORS = {{
  funding:    {{ el: 'funding-chart-container',  isOn: () => fundingVisible,    turnOn: () => toggleFunding() }},
  enrollment: {{ el: 'enrollment-container',     isOn: () => enrollmentVisible, turnOn: () => toggleEnrollment() }},
  h1b:        {{ el: 'h1b-container',            isOn: () => h1bVisible,        turnOn: () => toggleH1b() }},
}};

// Legacy ids used slug(key), so 'missouri_st' appeared as 'missouri-st'.
const UNI_BY_SLUG = {{}};
DATA.forEach(u => {{ UNI_BY_SLUG[slug(u.key)] = u.key; }});

function panelAnchorId(panel) {{
  return (currentKey ? currentKey + '--' : '') + panel;
}}

// Which university does this first path segment mean? Exact key, then the
// hyphenated legacy form, then a loose name match (kept from the original
// implementation so hand-typed links like #missouri-st keep working).
function resolveUniKey(seg) {{
  if (!seg) return null;
  const s = seg.toLowerCase();
  if (UNI_MAP[s]) return s;
  if (UNI_BY_SLUG[s]) return UNI_BY_SLUG[s];
  const underscored = s.replace(/-/g, '_');
  if (UNI_MAP[underscored]) return underscored;
  const bare = s.replace(/[^a-z0-9]/g, '');
  for (const u of DATA) {{
    if (u.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(bare)) return u.key;
  }}
  return null;
}}

// Split '#missouri-st--chemistry--2024?h1b=1' into its parts.
function parseUrlState() {{
  const raw = decodeURIComponent((location.hash || '').replace(/^#/, ''));
  if (!raw) return null;
  const [anchorPart, paramStr] = raw.split('?');
  const params = {{}};
  if (paramStr) {{
    paramStr.split('&').forEach(p => {{
      const [k, v] = p.split('=');
      params[k] = v;
    }});
  }}
  const segs = anchorPart.split('--').filter(Boolean);
  const key = resolveUniKey(segs[0]);
  return {{
    raw: anchorPart,
    key: (segs[0] || '').toLowerCase(),
    uniKey: key,
    segs: segs,
    panel: segs.length === 2 && PANEL_ANCHORS[segs[1]] ? segs[1] : null,
    params: params,
  }};
}}

// The canonical id for a parsed anchor, rebuilt from the resolved key so a
// legacy hyphenated link maps onto the element that is actually rendered.
function canonicalAnchorId(state) {{
  if (!state || !state.uniKey) return state ? state.raw : '';
  return [state.uniKey].concat(state.segs.slice(1)).join('--');
}}

function updateUrlState() {{
  if (!currentKey) return;
  let hash = currentAnchor && currentAnchor.split('--')[0] === currentKey ? currentAnchor : currentKey;
  const params = [];
  if (enrollmentVisible) params.push('enrollment=1');
  if (fundingVisible) params.push('funding=1');
  if (h1bVisible) params.push('h1b=1');
  if (msVisible) params.push('ms=1');
  if (params.length) hash += '?' + params.join('&');
  history.replaceState(null, '', '#' + hash);
}}

// Open whatever is hiding the target — a collapsed department, a collapsed
// year — then scroll to it and mark it briefly.
let _anchorFlashed = null;
function focusAnchor(id) {{
  if (!id) return false;
  let el = document.getElementById(id);
  if (!el) {{
    const want = id.toLowerCase().replace(/_/g, '-');
    const all = document.querySelectorAll('[id]');
    for (let i = 0; i < all.length; i++) {{
      if (all[i].id.toLowerCase().replace(/_/g, '-') === want) {{ el = all[i]; break; }}
    }}
  }}
  if (!el) return false;
  let node = el;
  while (node && node !== document.body) {{
    if (node.classList) {{
      node.classList.remove('collapsed');
      node.classList.remove('yr-collapsed');
    }}
    node = node.parentElement;
  }}
  if (_anchorFlashed) _anchorFlashed.classList.remove('anchor-flash');
  el.scrollIntoView({{ behavior: 'auto', block: 'start' }});
  el.classList.add('anchor-flash');
  _anchorFlashed = el;
  setTimeout(() => el.classList.remove('anchor-flash'), 2600);
  return true;
}}

// A deep link asks for an element that does not exist yet: #content is
// rendered after the university's JSON arrives, and the per-university pages
// render a second time from their inlined copy. So the request stays live for
// a few seconds and is re-applied after every render in that window.
let _pendingAnchor = null;
let _pendingUntil = 0;

function requestAnchor(id) {{
  _pendingAnchor = id;
  _pendingUntil = Date.now() + 4000;
}}

// Called after every renderUni().
function consumePendingAnchor() {{
  if (!_pendingAnchor) return;
  const id = _pendingAnchor;
  if (!focusAnchor(id)) setTimeout(() => focusAnchor(id), 250);
  if (Date.now() > _pendingUntil) {{
    _pendingAnchor = null;
  }} else {{
    setTimeout(() => {{ if (_pendingAnchor === id) _pendingAnchor = null; }},
               Math.max(0, _pendingUntil - Date.now()));
  }}
}}

function applyUrlState(state) {{
  if (!state) return;

  // A national chart or any other element already in the static page.
  if (!state.uniKey) {{
    if (document.getElementById(state.raw)) {{
      if (currentKey) {{ /* leave the university view alone */ }}
      focusAnchor(state.raw);
    }}
    return;
  }}

  // Panel toggles carried in the link, applied before the panels render.
  if (state.params.enrollment === '1' && !enrollmentVisible) toggleEnrollment();
  if (state.params.funding === '1' && !fundingVisible) toggleFunding();
  if (state.params.h1b === '1' && !h1bVisible) toggleH1b();
  if (state.params.ms === '1' && !msVisible) toggleMs();

  // A panel anchor opens the panel it names.
  if (state.panel) {{
    const p = PANEL_ANCHORS[state.panel];
    if (!p.isOn()) p.turnOn();
  }}
  // #<uni_key>--<year> addresses a master's block, which is hidden unless the
  // master's toggle is on.
  if (state.segs.length === 2 && /^[0-9]{{4}}$/.test(state.segs[1]) && !msVisible) toggleMs();

  const target = state.panel ? PANEL_ANCHORS[state.panel].el : canonicalAnchorId(state);
  currentAnchor = canonicalAnchorId(state);

  if (currentKey === state.uniKey && document.querySelector('#content h2')) {{
    // Same university already on screen — just move to the target.
    focusAnchor(target);
    return;
  }}
  // On /universities/<key>.html the data is inlined; use it rather than
  // triggering a second fetch of the same file.
  if (window._preloadedUniKey === state.uniKey && window._preloadedUniData
      && typeof UNI_CACHE !== 'undefined' && !UNI_CACHE[state.uniKey]) {{
    UNI_CACHE[state.uniKey] = window._preloadedUniData;
  }}
  if (state.panel) {{
    // Panels live outside #content and are already in the DOM.
    showUni(state.uniKey, true);
    setTimeout(() => focusAnchor(target), 120);
  }} else {{
    requestAnchor(target);
    showUni(state.uniKey, true);
  }}
}}

// Share anchor — copy a link to one specific thing on the page
function shareAnchor(id, event) {{
  if (event) event.stopPropagation();
  if (event && event.preventDefault) event.preventDefault();
  const base = location.origin + location.pathname;
  const url = base + '#' + id;
  if (typeof send === 'function') send({{type:'share',target:id,uni:currentKey||'',url:url}});
  navigator.clipboard.writeText(url).then(() => {{
    const el = event && event.currentTarget;
    if (el) {{
      const orig = el.textContent;
      el.textContent = '\u2713';
      el.style.opacity = '1';
      el.style.color = '#4ade80';
      setTimeout(() => {{ el.textContent = orig; el.style.color = ''; el.style.opacity = ''; }}, 1500);
    }}
  }}).catch(() => {{
    prompt('Copy this link:', url);
  }});
}}

// Share button — copy the current view (university plus any open panels)
function shareLink() {{
  updateUrlState();
  const url = location.href;
  if (typeof send === 'function') send({{type:'share',target:'main',uni:currentKey||'',url:url}});
  navigator.clipboard.writeText(url).then(() => {{
    const btn = document.getElementById('share-btn');
    const orig = btn.textContent;
    btn.textContent = '\u2713 Copied';
    btn.style.color = '#4ade80';
    setTimeout(() => {{ btn.textContent = orig; btn.style.color = ''; }}, 2000);
  }}).catch(() => {{
    prompt('Copy this link:', location.href);
  }});
}}

// On page load: restore state from URL. Runs again shortly afterwards because
// the per-university pages inline their data and render after this point.
(function() {{
  const state = parseUrlState();
  if (state) applyUrlState(state);
  window.addEventListener('load', function() {{
    const s = parseUrlState();
    if (s && s.uniKey && s.segs.length > 1) {{
      setTimeout(() => focusAnchor(s.panel ? PANEL_ANCHORS[s.panel].el : canonicalAnchorId(s)), 150);
    }} else if (s && !s.uniKey) {{
      focusAnchor(s.raw);
    }}
  }});
}})();

// Handle back/forward navigation and links pasted into an already-open tab
window.addEventListener('hashchange', function() {{
  const state = parseUrlState();
  if (state) applyUrlState(state);
}});

// ===== Department Filter (item 4) =====
window._activeDeptFilter = '';
const ALL_DEPTS = new Set();

// Populate department dropdown from loaded data
function populateDeptFilter() {{
  // Scan all cached university data for departments
  Object.values(UNI_CACHE).forEach(uni => {{
    if (!uni.records) return;
    uni.records.forEach(r => ALL_DEPTS.add(r[0]));
  }});
  const sel = document.getElementById('dept-filter');
  if (!sel) return;
  const current = sel.value;
  // Clear existing options except first
  while (sel.options.length > 1) sel.remove(1);
  const sorted = Array.from(ALL_DEPTS).sort((a, b) => {{
    if (a.toLowerCase() === 'general') return 1;
    if (b.toLowerCase() === 'general') return -1;
    return a.localeCompare(b);
  }});
  sorted.forEach(d => {{
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = d;
    sel.appendChild(opt);
  }});
  if (current) sel.value = current;
}}

// On first use, we need to fetch _all_ university data to know which unis have a dept.
// We'll do a lighter approach: scan the search index (already fetched for search).
function applyDeptFilter(dept) {{
  window._activeDeptFilter = dept;
  if (!dept) {{
    // Show all sidebar items
    document.querySelectorAll('.nav-item-wrap').forEach(w => w.style.display = '');
    // Re-render current uni without filter
    if (currentKey && UNI_CACHE[currentKey]) {{
      document.getElementById('content').innerHTML = renderUni(UNI_CACHE[currentKey]);
      updateOldToggle();
    }}
    return;
  }}
  // Use search index to find which unis have this dept
  if (!searchIndex) {{
    loadSearchIndex();
    setTimeout(() => applyDeptFilter(dept), 400);
    return;
  }}
  const unisWithDept = new Set();
  searchIndex.forEach(entry => {{
    if (entry[2] === dept) unisWithDept.add(entry[0]);
  }});
  // Filter sidebar
  document.querySelectorAll('.nav-item-wrap').forEach(w => {{
    const key = w.dataset.unikey;
    w.style.display = unisWithDept.has(key) ? '' : 'none';
  }});
  // Re-render current uni so the matching dept is auto-expanded
  if (currentKey && UNI_CACHE[currentKey]) {{
    document.getElementById('content').innerHTML = renderUni(UNI_CACHE[currentKey]);
    updateOldToggle();
  }}
}}

// Hook into showUni to populate dept filter with new data
const _origShowUni = showUni;
// We patch after fetch to populate departments
(function() {{
  const origFetch = window.fetch;
  // After each uni data load, update the dept filter options
  const observer = new MutationObserver(() => {{
    populateDeptFilter();
  }});
  observer.observe(document.getElementById('content'), {{ childList: true }});
}})();

// Also populate dept filter from the search index once it loads
(function() {{
  const origLoad = loadSearchIndex;
  const checkInterval = setInterval(() => {{
    if (searchIndex) {{
      clearInterval(checkInterval);
      const deptSet = new Set();
      searchIndex.forEach(entry => deptSet.add(entry[2]));
      const sel = document.getElementById('dept-filter');
      const sorted = Array.from(deptSet).sort((a, b) => {{
        if (a.toLowerCase() === 'general') return 1;
        if (b.toLowerCase() === 'general') return -1;
        return a.localeCompare(b);
      }});
      sorted.forEach(d => {{
        if (!ALL_DEPTS.has(d)) {{
          ALL_DEPTS.add(d);
          const opt = document.createElement('option');
          opt.value = d;
          opt.textContent = d;
          sel.appendChild(opt);
        }}
      }});
    }}
  }}, 500);
  // Stop checking after 30s
  setTimeout(() => clearInterval(checkInterval), 30000);
}})();
</script>
<script>
// Coach marks for first-time visitors
(function() {{
  if (localStorage.getItem('coach_done_v3') || location.hash.length > 1) return;

  let step = 0;
  const overlay = document.createElement('div');
  overlay.className = 'coach-overlay';
  const highlight = document.createElement('div');
  highlight.className = 'coach-highlight';
  highlight.style.position = 'fixed';
  const tooltip = document.createElement('div');
  tooltip.className = 'coach-tooltip';
  tooltip.style.position = 'fixed';

  function positionAt(el, tipSide) {{
    const r = el.getBoundingClientRect();
    highlight.style.left = (r.left - 4) + 'px';
    highlight.style.top = (r.top - 4) + 'px';
    highlight.style.width = (r.width + 8) + 'px';
    highlight.style.height = (r.height + 8) + 'px';
    if (tipSide === 'right') {{
      tooltip.style.left = (r.right + 16) + 'px';
      tooltip.style.top = (r.top) + 'px';
      tooltip.querySelector('.coach-arrow').className = 'coach-arrow left';
    }} else if (tipSide === 'bottom') {{
      tooltip.style.left = (r.left) + 'px';
      tooltip.style.top = (r.bottom + 16) + 'px';
      tooltip.querySelector('.coach-arrow').className = 'coach-arrow top';
    }} else if (tipSide === 'left') {{
      tooltip.style.left = (r.left - 296) + 'px';
      tooltip.style.top = (r.top - 10) + 'px';
      tooltip.querySelector('.coach-arrow').className = 'coach-arrow right';
    }}
  }}

  function showStep1() {{
    step = 1;
    const firstNav = document.querySelector('.nav-item');
    if (!firstNav) return cleanup();
    tooltip.innerHTML = '<div class="coach-arrow left"></div><div class="coach-step">Step 1 of 4</div><div class="coach-text"><strong>Sidebar navigation:</strong> Browse by university, or explore national charts, international comparisons, and pipeline analysis in the collapsible sections above.</div><button class="coach-dismiss" onclick="window._coachNext()">Got it</button>';
    document.body.appendChild(overlay);
    document.body.appendChild(highlight);
    document.body.appendChild(tooltip);
    positionAt(firstNav, 'right');
  }}

  function showStep2() {{
    step = 2;
    // Wait for content to load, then highlight first department
    const waitForDept = setInterval(() => {{
      const dept = document.querySelector('.dept-header');
      if (dept) {{
        clearInterval(waitForDept);
        tooltip.innerHTML = '<div class="coach-arrow top"></div><div class="coach-step">Step 2 of 4</div><div class="coach-text">Expand a department to see individual names, years, and links to the original thesis or dissertation.</div><button class="coach-dismiss" onclick="window._coachNext()">Next</button>';
        positionAt(dept, 'bottom');
      }}
    }}, 200);
    // Timeout safety
    setTimeout(() => clearInterval(waitForDept), 5000);
  }}

  function showStep3() {{
    step = 3;
    // Find the first share anchor (link icon) on a department header
    const waitForShare = setInterval(() => {{
      const shareEl = document.querySelector('.dept-header .share-anchor');
      if (shareEl) {{
        clearInterval(waitForShare);
        tooltip.innerHTML = '<div class="coach-arrow right"></div><div class="coach-step">Step 3 of 4</div><div class="coach-text">Click the # icon on any university, department, year, or panel to copy a link straight to it.</div><button class="coach-dismiss" onclick="window._coachNext()">Next</button>';
        positionAt(shareEl, 'left');
      }}
    }}, 200);
    setTimeout(() => clearInterval(waitForShare), 5000);
  }}

  function showStep4() {{
    step = 4;
    const toggleBar = document.querySelector('.toggle-bar') || document.querySelector('.toggle-wrap');
    if (!toggleBar) return cleanup();
    tooltip.innerHTML = '<div class="coach-arrow top"></div><div class="coach-step">Step 4 of 4</div><div class="coach-text"><strong>Toggle panels:</strong> Enable R&D Funding, Enrollment, and H-1B & OPT to see financial and immigration data for each university. The blue dots in the sidebar show which universities have OPT data.</div><button class="coach-dismiss" onclick="window._coachNext()">Done</button>';
    positionAt(toggleBar, 'bottom');
  }}

  function cleanup() {{
    overlay.remove();
    highlight.remove();
    tooltip.remove();
    localStorage.setItem('coach_done_v3', '1');
  }}

  window._coachNext = function() {{
    if (step === 1) {{
      // Click the first university to demo
      const firstNav = document.querySelector('.nav-item[data-key]');
      if (firstNav) firstNav.click();
      showStep2();
    }} else if (step === 2) {{
      showStep3();
    }} else if (step === 3) {{
      showStep4();
    }} else {{
      cleanup();
    }}
  }};

  // Also dismiss if they click the overlay
  overlay.addEventListener('click', cleanup);

  // Start after a short delay
  setTimeout(showStep1, 600);
}})();

// Analytics beacon
(function(){{
  var API='{ANALYTICS_ENDPOINT}';
  var sid=sessionStorage.getItem('_sid');
  if(!sid){{sid=Math.random().toString(36).substr(2,12);sessionStorage.setItem('_sid',sid);}}
  function send(data){{data.sid=sid;data.ua=navigator.userAgent;data.screen=screen.width+'x'+screen.height;navigator.sendBeacon?navigator.sendBeacon(API,JSON.stringify(data)):fetch(API,{{method:'POST',body:JSON.stringify(data),keepalive:true}});}}
  send({{type:'pageview',page:location.pathname+location.hash,referrer:document.referrer}});
  var clicks=0;
  document.addEventListener('click',function(e){{
    clicks++;
    var t=e.target.closest('.nav-item,.dept-header,.toggle-wrap,a.name-link');
    if(t){{var lbl=t.dataset.key||t.textContent.trim().substr(0,40);send({{type:'click',target:lbl,uni:currentKey||''}});}}
  }});
}})();
</script>
<script>
// WebMCP hooks — register tools for AI agent interaction
(function() {{
  if (!navigator.modelContext) return; // WebMCP not available

  const mc = navigator.modelContext;

  mc.registerTool({{
    name: 'list_universities',
    description: 'List all universities available on this site with their NRA percentage and record counts',
    inputSchema: {{ type: 'object', properties: {{}}, required: [] }},
    async execute() {{
      return {{ content: [{{ type: 'text', text: JSON.stringify(DATA.map(u => ({{ key: u.key, name: u.name, nra: u.nra, records: u.count }}))) }}] }};
    }}
  }});

  mc.registerTool({{
    name: 'get_university_data',
    description: 'Get thesis/dissertation records for a specific university. Returns records with department, year, author name, degree type, and title.',
    inputSchema: {{
      type: 'object',
      properties: {{
        university_key: {{ type: 'string', description: 'University key (e.g. purdue, mit, stanford). Use list_universities to find valid keys.' }}
      }},
      required: ['university_key']
    }},
    async execute(args) {{
      const key = args.university_key;
      if (UNI_CACHE[key]) return {{ content: [{{ type: 'text', text: JSON.stringify(UNI_CACHE[key]) }}] }};
      const resp = await fetch(DATA_DIR + '/' + key + '.json');
      if (!resp.ok) return {{ content: [{{ type: 'text', text: 'University not found: ' + key }}] }};
      const uni = await resp.json();
      UNI_CACHE[key] = uni;
      return {{ content: [{{ type: 'text', text: JSON.stringify(uni) }}] }};
    }}
  }});

  mc.registerTool({{
    name: 'get_data_catalog',
    description: 'Get the full data catalog with version info, schemas, and links to all datasets and government sources',
    inputSchema: {{ type: 'object', properties: {{}}, required: [] }},
    async execute() {{
      const resp = await fetch('/catalog.json');
      const catalog = await resp.json();
      return {{ content: [{{ type: 'text', text: JSON.stringify(catalog) }}] }};
    }}
  }});

  mc.registerTool({{
    name: 'get_taxonomy',
    description: 'Get the department taxonomy mapping variant department names to 44 canonical STEM and non-STEM categories',
    inputSchema: {{ type: 'object', properties: {{}}, required: [] }},
    async execute() {{
      const resp = await fetch('/data/taxonomy.json');
      const tax = await resp.json();
      return {{ content: [{{ type: 'text', text: JSON.stringify(tax) }}] }};
    }}
  }});

  mc.registerTool({{
    name: 'navigate_to_university',
    description: 'Navigate the page to show a specific university. Optionally expand a specific department.',
    inputSchema: {{
      type: 'object',
      properties: {{
        university_key: {{ type: 'string', description: 'University key (e.g. purdue, mit)' }},
        department: {{ type: 'string', description: 'Optional: department name to auto-expand' }}
      }},
      required: ['university_key']
    }},
    async execute(args) {{
      showUni(args.university_key);
      if (args.department) {{
        window._activeDeptFilter = args.department;
      }}
      return {{ content: [{{ type: 'text', text: 'Navigated to ' + args.university_key }}] }};
    }}
  }});

}})();
</script>
<script src="/chat-widget.js"></script>
</body>
</html>"""


def load_all(stem_filter='stem'):
    """Load records for all CONFIGS with the given STEM filter."""
    data_by_key = {}

    for config in CONFIGS:
        if not os.path.exists(config['file']):
            continue

        # Inject the stem filter into each config
        cfg = dict(config)
        cfg['_stem_filter'] = stem_filter

        records = load_records(cfg)
        key = cfg['key']
        if cfg.get('_merge') and key in data_by_key:
            merge_university_records(
                data_by_key[key][3], records,
                authoritative=bool(cfg.get('degree_label')),
            )
        else:
            entry = [cfg['key'], cfg['name'], cfg['nra'], records]
            data_by_key[key] = entry

    return [(e[0], e[1], e[2], e[3]) for e in data_by_key.values()]


def write_data_files(all_data, data_dir, is_nonstem=False):
    """Write per-university JSON files and a search index."""
    import json
    os.makedirs(data_dir, exist_ok=True)

    search_entries = []  # lightweight search index

    for uni_key, uni_name, nra, records in all_data:
        compact = []
        for r in records:
            compact.append([
                r['dept'], r['year'], r['name'],
                r['classification'] or '', r['confidence'] or '',
                r['title'][:90], r['url'], r.get('degree', ''),
            ])
            # Add to search index: just name + dept, enough for matching
            search_entries.append([uni_key, r['name'], r['dept'], r['year']])

        # MERGE-NOT-OVERWRITE: preserve enrichment fields from prior runs.
        # generate is responsible for `key`, `name`, `nra`, `records`.
        # enrich adds h1b, opt, lca, perm, enrollment, funding, etc.
        # Without this merge, generate would silently destroy all enrichment.
        json_path = os.path.join(data_dir, f'{uni_key}.json')
        merged = {'key': uni_key, 'name': uni_name, 'nra': nra, 'records': compact}
        if os.path.exists(json_path):
            try:
                with open(json_path) as f:
                    existing = json.load(f)
                # Preserve any field added by enrich
                for k, v in existing.items():
                    if k not in ('key', 'name', 'nra', 'records'):
                        merged[k] = v
            except (json.JSONDecodeError, IOError):
                pass

        with open(json_path, 'w') as f:
            json.dump(merged, f, ensure_ascii=False, separators=(',', ':'))

    # Write search index
    with open(os.path.join(data_dir, '_search.json'), 'w') as f:
        json.dump(search_entries, f, ensure_ascii=False, separators=(',', ':'))

    # Write universities_index.json (top-level data/) — shared by both sidebars (SPA + sidebar.js).
    # This is the SINGLE SOURCE OF TRUTH for the university list.
    if not is_nonstem:
        site_data_dir = os.path.dirname(data_dir)  # site/data
        idx_unis = []
        for uni_key, uni_name, nra, records in all_data:
            # Check if this uni has OPT data (read enriched JSON)
            jp = os.path.join(data_dir, f'{uni_key}.json')
            has_opt = False
            try:
                if os.path.exists(jp):
                    with open(jp) as f:
                        d = json.load(f)
                    has_opt = bool(d.get('opt'))
            except (json.JSONDecodeError, IOError):
                pass
            idx_unis.append({
                'key': uni_key,
                'name': uni_name,
                'nra': nra,
                'has_opt': has_opt,
            })
        idx = {'universities': idx_unis, 'count': len(idx_unis)}
        with open(os.path.join(site_data_dir, 'universities_index.json'), 'w') as f:
            json.dump(idx, f, separators=(',', ':'))
        print(f"  universities_index.json: {len(idx_unis)} universities")

    total_size = sum(os.path.getsize(os.path.join(data_dir, fn)) for fn in os.listdir(data_dir))
    print(f"  Data files: {data_dir}/ ({len(all_data)} universities, {total_size/1024/1024:.1f} MB total)")


def main():
    for label, stem_filter, html_file, data_subdir in [
        ("STEM", "stem", "site/stem.html", "site/data/stem"),
        ("NON-STEM", "non-stem", "site/non_stem.html", "site/data/nonstem"),
    ]:
        print(f"=== {label} ===", flush=True)
        data = load_all(stem_filter)
        total = sum(len(u[3]) for u in data)
        print(f"  {total:,} records across {len(data)} schools")

        write_data_files(data, data_subdir, is_nonstem=(stem_filter == "non-stem"))
        html = build_html(data, mode=stem_filter)
        with open(html_file, 'w') as f:
            f.write(html)
        print(f"→ {html_file} ({len(html):,} bytes)")


if __name__ == "__main__":
    main()
