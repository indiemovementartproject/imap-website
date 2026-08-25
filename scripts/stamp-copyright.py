#!/usr/bin/env python3
"""Put the copyright header on every source file, and keep it there.

Idempotent: running it twice changes nothing. Run it after adding new files.

    python3 scripts/stamp-copyright.py          # stamp anything missing it
    python3 scripts/stamp-copyright.py --check  # exit 1 if anything is missing it
"""
import os, re, sys

YEAR   = 2026
OWNER  = 'Indie Movement Art Project'
AUTHOR = 'Prashant Nair'
MARK   = 'Copyright (c) %d %s' % (YEAR, OWNER)

LINES = [
    MARK + '. All rights reserved.',
    'Author: ' + AUTHOR + '. Proprietary - see LICENSE. Not open source.',
]

SKIP_DIRS  = {'.git', 'node_modules', 'scripts'}
SKIP_FILES = {'sitemap.xml', 'robots.txt', 'CNAME'}

def html_header():
    return '<!--\n  ' + '\n  '.join(LINES) + '\n-->\n'

def block_header():
    return '/*!\n * ' + '\n * '.join(LINES) + '\n */\n'

def stamp_html(text):
    """After the doctype, never before it — a comment ahead of <!DOCTYPE>
       can drop old browsers into quirks mode."""
    m = re.match(r'(\s*<!DOCTYPE[^>]*>\s*\n?)', text, re.I)
    if m:
        return text[:m.end()] + html_header() + text[m.end():]
    return html_header() + text

def stamp_block(text):
    if text.startswith('#!'):                      # keep any shebang first
        i = text.index('\n') + 1
        return text[:i] + block_header() + text[i:]
    return block_header() + text

HANDLERS = {'.html': stamp_html, '.js': stamp_block, '.gs': stamp_block, '.css': stamp_block}

def targets():
    for root, dirs, files in os.walk('.'):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in sorted(files):
            if f in SKIP_FILES: continue
            if os.path.splitext(f)[1].lower() in HANDLERS:
                yield os.path.join(root, f)

def main():
    check = '--check' in sys.argv
    missing, stamped = [], []
    for path in targets():
        with open(path, encoding='utf-8') as fh:
            text = fh.read()
        if MARK in text[:4000]:
            continue
        missing.append(path)
        if check:
            continue
        fn = HANDLERS[os.path.splitext(path)[1].lower()]
        with open(path, 'w', encoding='utf-8') as fh:
            fh.write(fn(text))
        stamped.append(path)

    if check:
        for p in missing:
            print('missing header: %s' % p)
        print('%d file(s) without a copyright header' % len(missing))
        return 1 if missing else 0

    for p in stamped:
        print('  stamped %s' % p)
    print('%d file(s) stamped, %d already had it'
          % (len(stamped), sum(1 for _ in targets()) - len(stamped)))
    return 0

if __name__ == '__main__':
    sys.exit(main())
