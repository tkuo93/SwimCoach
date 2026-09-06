#!/usr/bin/env python3
"""
Simple check for app.js syntax error
"""

import subprocess
import sys

print("=== Checking App.js Syntax Issues ===\n")

# First check what the syntax error says
print("Looking for syntax error in d86a303...")

# Get d86a303's app.js
result = subprocess.run(
    ['git', 'show', 'd86a303:SwimCoach-project/public/js/app.js', '--', '--unified=0'],
    capture_output=True,
    text=True
)

if result.returncode == 0:
    content = result.stdout
    # Look for the specific error
    if 'Uncaught SyntaxError' in content:
        print("✗ Found SyntaxError in d86a303")
        # Extract the error context
        lines = content.split('\n')
        for i, line in enumerate(lines):
            if 'Uncaught SyntaxError' in line or 'SyntaxError' in line:
                print(f"Error at or near line {i+1}")
                # Show surrounding context
                for j in range(max(0, i-3), min(len(lines), i+4)):
                    marker = ">>> " if j == i else "    "
                    print(f"{marker}{j+1}: {lines[j][:100]}")
                break
    else:
        print("✓ No syntax errors found in d86a303")

else:
    print("✗ Could not access d86a303's app.js")

# Check 1e4ad27
print(f"\n--- Checking 1e4ad27 ---")
result2 = subprocess.run(
    ['git', 'show', '1e4ad27:SwimCoach-project/public/js/app.js', '--', '--unified=0'],
    capture_output=True,
    text=True
)

if result2.returncode == 0:
    content2 = result2.stdout
    if 'Uncaught SyntaxError' in content2:
        print("✗ Found SyntaxError in 1e4ad27")
    else:
        print("✓ No syntax errors in 1e4ad27")

print(f"\n{'='*60}")
print("CONCLUSION:")
print("\nSince the user reports a syntax error in d86a303 at line 1666,")
print("and 1e4ad27 has working auth but may not have all the navigation fixes")
print("from d86a303...")
print("\nSOLUTION:")
print("1. Option A: Fix just the syntax error in d86a303 (quick)")
print("2. Option B: Check out 1e4ad27 for working auth (complete fix)")
print("\nWhich approach would you prefer?")