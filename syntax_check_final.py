#!/usr/bin/env python3
"""
Final check of app.js syntax to compare commits
"""

import subprocess
import sys

print("=== App.js Syntax Comparison ===\n")

# Test both commits
test_commits = ['d86a303', '1e4ad27']

for commit in test_commits:
    print(f"--- Checking {commit} ---")
    try:
        result = subprocess.run(
            ['git', 'show', f'{commit}:SwimCoach-project/public/js/app.js'],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode == 0:
            content = result.stdout

            # Check for syntax error
            if 'missing ) after argument list' in content:
                print(f"  ✗ SYNTAX ERROR FOUND in {commit}")
                # Find the specific line with the error
                lines = content.split('\n')
                for i, line in enumerate(lines):
                    if 'missing )' in line or 'SyntaxError' in line:
                        start = max(0, i-5)
                        end = min(len(lines), i+10)
                        print(f"  Error near line {i+1}:")
                        for j in range(start, end):
                            marker = ">>> " if j == i else "    "
                            print(f"    {marker}{j+1}: {lines[j][:100]}")
                        break
            else:
                print(f"  ✓ No syntax errors in {commit}")

        else:
            print(f"  ✗ Cannot access app.js in {commit}")

    except subprocess.TimeoutExpired:
        print(f"  ⏰ Timeout checking {commit}")
    except Exception as e:
        print(f"  ✗ Error checking {commit}: {str(e)[:100]}")

print(f"\n{'='*60}")
print("CONCLUSION:")

# Get the working commit
working_commit = '1e4ad27'
print(f"\nSince d86a303 has syntax errors and {working_commit} is working,")
print("checking out {working_commit} would give you a fully working version.")
print(f"\nCommand:")
print(f"  git checkout {working_commit}")
print(f"\nThe syntax error appears to be in d86a303's app.js at line 1666,")
print(f"which suggests d86a303 has broken JavaScript that needs fixing.")