"""
Lambda entry point for the PhD Demographics chat assistant.

THIS FILE IS A SHIM. It exists only because the SAM template pins
``Handler: index.handler``.

The implementation lives in the public repo at ``cloud/chat/`` — handler.py,
prompt.py, tools.py, blocks.py, data_store.py — and ``deploy.sh`` copies those
modules plus the generated ``chat_data/`` artifacts into this directory before
``sam build`` runs. Previously there were two divergent copies of the handler
(this file and cloud/chat/handler.py); there is now one, and it is the one
under version control alongside the data that feeds it.

Do not edit the copied *.py files here. Edit cloud/chat/ and re-run deploy.sh.
"""
from handler import handler  # noqa: F401
