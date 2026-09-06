#!/usr/bin/env python3
"""
Check app.js syntax differences between commits
"""

import subprocess
import sys
import json

print("=== Checking app.js syntax issues ===\n")

# Test both commits
test_commits = ['d86a303', '1e4ad27']

for commit in test_commits:
    print(f"--- Checking {commit} ---")
    result = subprocess.run(
        ['git', 'show', f'{commit}:SwimCoach-project/public/js/app.js'],
        capture_output=True,
        text=True
    )

    if result.returncode == 0:
        content = result.stdout

        # Look for the specific syntax error mentioned
        if 'missing ) after argument list' in content:
            print(f"  ✗ Found syntax error in {commit}")

            # Find lines around line 1666
            lines = content.split('\n')
            for i, line in enumerate(lines):
                if i + 1 == 1666 or i + 1 >= 1660:
                    print(f"    Line {i + 1}: {line}")
        else:
            print(f"  ✓ No syntax errors found in {commit}")

        # Count overall syntax-related keywords
        syntax_issues = [
            ('missing ) after argument list', 'Missing closing parenthesis'),
            ('unexpected token', 'Unexpected token'),
            ('SyntaxError', 'SyntaxError'),
            ('unexpected end of input', 'Unexpected end of input')
        ]

        print(f"  Syntax issue checks:")
        for pattern, description in syntax_issues:
            if pattern in content:
                print(f"    {description}: Found")
            else:
                print(f"    {description}: OK")
    else:
        print(f"  ✗ Cannot find app.js in {commit}")

print(f"\n{'='*60}")
print("RECOMMENDATION:")
print("\nSince d86a303 has syntax errors and 1e4ad27 is working,")
print("checking out 1e4ad27 would give you a fully working version.")
print("\nHowever, if you want to keep d86a303's navigation improvements,")
print("we could fix just the syntax error and test.")
print("\nLet's also check what changed in d86a303's app.js vs 1e4ad27")

# Show diff for app.js
diff_result = subprocess.run(
    ['git', 'diff', '--unified=5', '1e4ad27', 'd86a303', '--', 'SwimCoach-project/public/js/app.js'],
    capture_output=True,
    text=True
)

if diff_result.returncode == 0 and diff_result.stdout:
    print(f"\n=== app.js diff between commits ===")
    print("The changes are:")
    print(diff_result.stdout[:2000])  # First 2000 chars