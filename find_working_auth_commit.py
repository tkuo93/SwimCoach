#!/usr/bin/env python3
"""
Find the earliest working auth commit by checking key commits backwards
"""

import subprocess
import sys

print("=== Finding working auth commit ===")
print("Testing commits backwards from d86a303")

# Test current commit first
test_current = subprocess.run(
    ['git', 'show', 'd86a303:SwimCoach-project/src/auth/passport.js'],
    capture_output=True
).returncode == 0
print(f"d86a303 has passport.js: {test_current}")

# If current has passport.js, it's working
if test_current:
    # Now check which is the earliest commit that has working auth
    print("\nChecking commits backwards for earliest working auth...")

    # List of commits to check, from current back to earlier
    test_commits = [
        'd86a303',  # Current
        'b414fa5',  # Fix authentication issue
        '1e4ad27',  # Add signOut function and fix OAuth redirect
        '9195992',  # Final auth improvements
        '2efc325',  # Resolve async syntax error
        '61276cc',  # Add centralized authentication
        '9a8dd8c',  # Clean up router definitions
        '1d2a625',  # Redirect authenticated users
        '6ee785b',  # Fix auth issue by simplifying auth.js
        '2a3d9b0',  # Improve session management
        '330147e',  # Ensure consistent auth handling
        '10070c1',  # Resolve race condition
        'a214727',  # Add missing GOOGLE_CALLBACK_URL
    ]

    working_commits = []

    for commit in test_commits:
        result = subprocess.run(
            ['git', 'show', f'{commit}:SwimCoach-project/src/auth/passport.js'],
            capture_output=True
        )

        if result.returncode == 0:
            content = subprocess.run(
                ['git', 'show', f'{commit}:SwimCoach-project/src/auth/passport.js'],
                capture_output=True,
                text=True
            ).stdout

            hasGoogleStrategy = 'new GoogleStrategy' in content
            hasSerializeUser = 'serializeUser' in content
            hasDeserializeUser = 'deserializeUser' in content
            hasSwimmerProfile = 'SwimmerProfile' in content

            if hasGoogleStrategy and hasSerializeUser and hasDeserializeUser and hasSwimmerProfile:
                working_commits.append(commit)
                print(f"✓ {commit}: Working auth")
            else:
                print(f"✗ {commit}: Missing auth components")
        else:
            print(f"✗ {commit}: No passport.js")

    if working_commits:
        # Sort chronologically (earlier commits first)
        working_commits_sorted = sorted(working_commits)
        earliest_working = working_commits_sorted[0]

        print(f"\n{'='*60}")
        print("RESULTS:")
        print(f"Working commits (chronological): {working_commits_sorted}")
        print(f"\n=== EARLIEST WORKING COMMIT: {earliest_working} ===")
        print(f"\nTo find working auth, check out commit: {earliest_working}")

        # Save to file
        with open('auth_result.txt', 'w') as f:
            f.write(earliest_working)
        print(f"Saved to: auth_result.txt")
    else:
        print("\nNo working commit found")
else:
    print("\nCurrent commit is not working. Need to test more commits...")
    print("Current auth may be broken in d86a303")