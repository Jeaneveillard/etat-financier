#!/bin/bash
cd "$(dirname "$0")"
echo ""
echo "  État financier — http://127.0.0.1:8776/"
echo "  Laissez ce terminal ouvert."
echo ""
python3 -m http.server 8776 --bind 127.0.0.1
