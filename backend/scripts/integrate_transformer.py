#!/usr/bin/env python3
"""
integrate_transformer.py - Automated integration script for DataTransformationService

This script automatically integrates the data transformer into your existing backend:
1. Backs up existing files
2. Updates main.py with transformer initialization
3. Updates machines.py router with transformation calls
4. Runs tests to verify installation
5. Provides rollback if needed

Usage:
    python scripts/integrate_transformer.py --apply
    python scripts/integrate_transformer.py --test-only
    python scripts/integrate_transformer.py --rollback
"""

import os
import sys
import shutil
import subprocess
import argparse
from datetime import datetime
from pathlib import Path

# Colors for terminal output
GREEN = '\033[92m'
YELLOW = '\033[93m'
RED = '\033[91m'
BLUE = '\033[94m'
RESET = '\033[0m'

def print_status(message, color=BLUE):
    """Print colored status message"""
    print(f"{color}{'='*70}{RESET}")
    print(f"{color}{message}{RESET}")
    print(f"{color}{'='*70}{RESET}")

def print_success(message):
    print(f"{GREEN}✅ {message}{RESET}")

def print_warning(message):
    print(f"{YELLOW}⚠️  {message}{RESET}")

def print_error(message):
    print(f"{RED}❌ {message}{RESET}")

def create_backup(filepath):
    """Create timestamped backup of file"""
    if not os.path.exists(filepath):
        print_warning(f"File not found: {filepath}")
        return None
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = f"{filepath}.backup_{timestamp}"
    shutil.copy2(filepath, backup_path)
    print_success(f"Backed up {filepath} → {backup_path}")
    return backup_path

def update_main_py():
    """Update main.py to initialize transformer"""
    main_path = "main.py"
    
    if not os.path.exists(main_path):
        print_error(f"{main_path} not found!")
        return False
    
    # Read current content
    with open(main_path, 'r') as f:
        content = f.read()
    
    # Check if already integrated
    if 'init_transformer' in content:
        print_warning("main.py already has transformer initialization")
        return True
    
    # Add import
    import_line = "from utils.data_transformer import init_transformer\n"
    if 'from database import' in content:
        content = content.replace(
            'from database import startup_db, shutdown_db, db_manager\n',
            'from database import startup_db, shutdown_db, db_manager\n' + import_line
        )
    else:
        print_error("Could not find database import in main.py")
        return False
    
    # Add initialization in lifespan
    if '@asynccontextmanager' in content and 'async def lifespan' in content:
        # Find the startup_db() call and add transformer init after it
        lines = content.split('\n')
        new_lines = []
        for i, line in enumerate(lines):
            new_lines.append(line)
            if 'await startup_db()' in line:
                # Add transformer initialization
                indent = line[:len(line) - len(line.lstrip())]
                new_lines.append(f"{indent}")
                new_lines.append(f"{indent}# Initialize data transformation layer")
                new_lines.append(f"{indent}init_transformer(db_manager.db)")
                new_lines.append(f"{indent}logger.info('✅ Data transformation layer initialized')")
        
        content = '\n'.join(new_lines)
    else:
        print_error("Could not find lifespan function in main.py")
        return False
    
    # Write updated content
    with open(main_path, 'w') as f:
        f.write(content)
    
    print_success("Updated main.py with transformer initialization")
    return True

def run_tests():
    """Run transformer tests"""
    print_status("Running Tests")
    
    try:
        result = subprocess.run(
            [sys.executable, '-m', 'pytest', 'tests/test_data_transformer.py', '-v'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        print(result.stdout)
        
        if result.returncode == 0:
            print_success("All tests passed!")
            return True
        else:
            print_error("Tests failed!")
            print(result.stderr)
            return False
            
    except subprocess.TimeoutExpired:
        print_error("Tests timed out!")
        return False
    except Exception as e:
        print_error(f"Error running tests: {e}")
        return False

def verify_installation():
    """Verify that all required files exist"""
    print_status("Verifying Installation")
    
    required_files = [
        'utils/data_transformer.py',
        'tests/test_data_transformer.py',
        'routers/machines_with_transformer.py',
        'TRANSFORMER_INTEGRATION_GUIDE.md'
    ]
    
    all_exist = True
    for filepath in required_files:
        if os.path.exists(filepath):
            print_success(f"Found: {filepath}")
        else:
            print_error(f"Missing: {filepath}")
            all_exist = False
    
    return all_exist

def show_next_steps():
    """Show next steps for manual integration"""
    print_status("Next Steps", YELLOW)
    
    print(f"""
{YELLOW}To complete the integration:{RESET}

1. {GREEN}Replace machines.py router:{RESET}
   mv routers/machines_with_transformer.py routers/machines.py

2. {GREEN}Restart backend:{RESET}
   pkill -f "uvicorn main:app"
   python main.py

3. {GREEN}Test endpoints:{RESET}
   curl http://localhost:8000/api/v1/machines/YOUR-MACHINE-ID | jq '.heartbeat.cpu_usage_percent'

4. {GREEN}Read full guide:{RESET}
   cat TRANSFORMER_INTEGRATION_GUIDE.md

{BLUE}For automatic router replacement, run:{RESET}
   python scripts/integrate_transformer.py --apply --replace-router
""")

def replace_router():
    """Replace machines.py with transformer version"""
    backup_created = create_backup("routers/machines.py")
    if not backup_created:
        return False
    
    try:
        shutil.move("routers/machines_with_transformer.py", "routers/machines.py")
        print_success("Replaced routers/machines.py with transformer version")
        return True
    except Exception as e:
        print_error(f"Error replacing router: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(
        description="Integrate DataTransformationService into backend"
    )
    parser.add_argument(
        '--apply',
        action='store_true',
        help='Apply integration (updates main.py)'
    )
    parser.add_argument(
        '--replace-router',
        action='store_true',
        help='Replace machines.py router (requires --apply)'
    )
    parser.add_argument(
        '--test-only',
        action='store_true',
        help='Only run tests, do not modify files'
    )
    parser.add_argument(
        '--rollback',
        action='store_true',
        help='Restore from most recent backup'
    )
    
    args = parser.parse_args()
    
    # Print header
    print_status("🚀 Data Transformer Integration Tool", GREEN)
    print(f"{BLUE}Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}{RESET}\n")
    
    # Verify files exist
    if not verify_installation():
        print_error("Installation verification failed!")
        print("Make sure you have all required files.")
        return 1
    
    # Test only mode
    if args.test_only:
        if run_tests():
            print_success("Tests passed! Ready for integration.")
            return 0
        else:
            print_error("Tests failed! Fix issues before integrating.")
            return 1
    
    # Rollback mode
    if args.rollback:
        print_status("Rollback Mode")
        # Find most recent backups
        main_backups = sorted([f for f in os.listdir('.') if f.startswith('main.py.backup_')])
        router_backups = sorted([f for f in os.listdir('routers') if f.startswith('machines.py.backup_')])
        
        if main_backups:
            latest_main = main_backups[-1]
            shutil.copy2(latest_main, 'main.py')
            print_success(f"Restored main.py from {latest_main}")
        
        if router_backups:
            latest_router = f"routers/{router_backups[-1]}"
            shutil.copy2(latest_router, 'routers/machines.py')
            print_success(f"Restored machines.py from {router_backups[-1]}")
        
        print_success("Rollback complete!")
        return 0
    
    # Apply integration
    if args.apply:
        print_status("Applying Integration")
        
        # Step 1: Backup files
        create_backup("main.py")
        create_backup("routers/machines.py")
        
        # Step 2: Update main.py
        if not update_main_py():
            print_error("Failed to update main.py")
            return 1
        
        # Step 3: Run tests
        if not run_tests():
            print_warning("Tests failed, but integration applied to main.py")
            print_warning("Review test output and fix issues")
            return 1
        
        # Step 4: Replace router if requested
        if args.replace_router:
            if not replace_router():
                print_error("Failed to replace router")
                return 1
        
        print_success("Integration complete!")
        
        if not args.replace_router:
            show_next_steps()
        else:
            print_status("✅ INTEGRATION COMPLETE!", GREEN)
            print(f"""
{GREEN}The transformation layer is now active!{RESET}

{YELLOW}Next steps:{RESET}
1. Restart backend: python main.py
2. Test endpoints (see TRANSFORMER_INTEGRATION_GUIDE.md)
3. Verify frontend displays data correctly

{BLUE}Rollback if needed:{RESET}
   python scripts/integrate_transformer.py --rollback
""")
        
        return 0
    
    # No arguments - show help
    parser.print_help()
    print(f"\n{YELLOW}Quick start:{RESET}")
    print(f"  Test only:  python scripts/integrate_transformer.py --test-only")
    print(f"  Integrate:  python scripts/integrate_transformer.py --apply")
    print(f"  Full auto:  python scripts/integrate_transformer.py --apply --replace-router")
    return 0

if __name__ == '__main__':
    sys.exit(main())
