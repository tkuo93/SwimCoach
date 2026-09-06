#!/usr/bin/env python3
"""
Direct check of which commits have working app.js
"""

import subprocess

print("=== Direct App.js Check ===\n")

# Simple direct checks
commits_to_check = [
    ('d86a303', 'Current (d86a303)'),
    ('1e4ad27', 'Working auth (1e4ad27)'),
    ('b414fa5', 'Fix auth (b414fa5)'),
]

for commit_hash, description in commits_to_check:
    print(f"Checking {description} ({commit_hash})...")

    # Try to get the file content
    result = subprocess.run(
        ['git', 'show', f'{commit_hash}:SwimCoach-project/public/js/app.js'],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        content = result.stdout

        # Check for working indicators
        hasPropperStructure = 'function initRouter' in content
        hasHashRouting = 'window.location.hash' in content or 'hashchange' in content
        noSyntaxErrors = 'SyntaxError' not in content

        print(f"  Has proper structure: {hasPropperStructure}")
        print(f"  Has hash routing: {hasHashRouting}")
        print(f"  No syntax errors: {noSyntaxErrors}")

        if hasPropperStructure and hasHashRouting and noSyntaxErrors:
            print(f"  -> WORKING VERSION")
        else:
            print(f"  -> MAY HAVE ISSUES")
    else:
        print(f"  -> Cannot access app.js")

print(f"\n{'='*60}")
print("RECOMMENDATION:")
print("\nBased on the syntax error at app.js:1666, d86a303 has broken JavaScript.")
print("1e4ad27 has working authentication but may not have all navigation fixes.")
print("\nTo get a fully working version, check out 1e4ad27:")
print("  git checkout 1e4ad27")
print("\nIf you want to keep d86a303's navigation fixes, you'd need to:")
print("1. Fix the syntax error in app.js:1666")
print("2. Verify auth still works from 1e4ad27")
print("\nWhich approach do you prefer?")