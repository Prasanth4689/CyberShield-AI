"""
CyberShield AI — Master PDF Generation Script
=============================================
Generates all 3 official deliverables in high quality:
  1. CyberShield_AI_Idea_Submission.pdf (16:9 Widescreen Presentation via PowerPoint COM)
  2. CyberShield_AI_Solution_Report.pdf (Executive Report via Headless Chrome HTML-to-PDF)
  3. CyberShield_AI_Source_Code_Documentation.pdf (Code Architecture Docs via Headless Chrome HTML-to-PDF)

Ensures files are cleanly saved in the pdfs/ directory.
"""

import os
import sys
import shutil
import subprocess

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
PDFS_DIR = os.path.join(BASE_DIR, "pdfs")
os.makedirs(PDFS_DIR, exist_ok=True)

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
if not os.path.exists(CHROME_PATH):
    CHROME_PATH = r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"

def run_presentation_generator():
    print("---------------------------------------------------------")
    print("[1/3] Checking 16:9 Widescreen Presentation PDF...")
    print("---------------------------------------------------------")
    target_pdf = os.path.join(BASE_DIR, "CyberShield_AI_Idea_Submission.pdf")
    target_pdf_alt = os.path.join(PDFS_DIR, "CyberShield_AI_Idea_Submission.pdf")
    for p in [target_pdf, target_pdf_alt]:
        if os.path.exists(p) and os.path.getsize(p) > 500000:
            print(f"[OK] High-quality 16:9 Presentation PDF already exists ({os.path.getsize(p):,} bytes). Skipping COM re-export.")
            return
    build_script = os.path.join(BASE_DIR, "build_presentation.py")
    if os.path.exists(build_script):
        res = subprocess.run([sys.executable, build_script], capture_output=True, text=True)
        print(res.stdout)
        if res.stderr:
            print("Stderr:", res.stderr)
    else:
        print("[ERROR] build_presentation.py not found!")

def convert_html_to_pdf(html_filename, pdf_filename):
    html_path = f"file:///{os.path.join(BASE_DIR, html_filename)}".replace("\\", "/")
    pdf_path = os.path.join(BASE_DIR, pdf_filename)
    tmp_dir = os.path.join(BASE_DIR, ".chrome_export_tmp")
    
    print(f"Converting {html_filename} -> {pdf_filename}...")
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--user-data-dir={tmp_dir}",
        f"--print-to-pdf={pdf_path}",
        html_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    
    # Cleanup tmp dir
    if os.path.exists(tmp_dir):
        shutil.rmtree(tmp_dir, ignore_errors=True)
        
    if os.path.exists(pdf_path):
        size = os.path.getsize(pdf_path)
        print(f"[OK] Created {pdf_filename} ({size:,} bytes)")
        return True
    else:
        print(f"[ERROR] Failed to generate {pdf_filename}: {res.stderr}")
        return False

def copy_to_pdfs_folder():
    print("---------------------------------------------------------")
    print("Copying deliverables to pdfs/ folder...")
    print("---------------------------------------------------------")
    deliverables = [
        "CyberShield_AI_Idea_Submission.pdf",
        "CyberShield_AI_Solution_Report.pdf",
        "CyberShield_AI_Source_Code_Documentation.pdf"
    ]
    for filename in deliverables:
        src = os.path.join(BASE_DIR, filename)
        dst = os.path.join(PDFS_DIR, filename)
        if os.path.exists(src):
            shutil.copy2(src, dst)
            print(f"[OK] Copied {filename} -> pdfs/{filename}")
        elif not os.path.exists(dst):
            print(f"[WARN] {filename} missing in both root and pdfs directory!")
        else:
            print(f"[OK] {filename} already up-to-date in pdfs/{filename}")

def main():
    print("=== CyberShield AI Master Deliverable Generator ===")
    
    # Step 1: Presentation PDF
    run_presentation_generator()
    
    # Step 2: Solution Report PDF
    print("---------------------------------------------------------")
    print("[2/3] Generating Executive Solution Report PDF...")
    print("---------------------------------------------------------")
    convert_html_to_pdf("report_print.html", "CyberShield_AI_Solution_Report.pdf")
    
    # Step 3: Code Documentation PDF
    print("---------------------------------------------------------")
    print("[3/3] Generating Source Code Documentation PDF...")
    print("---------------------------------------------------------")
    convert_html_to_pdf("code_docs_print.html", "CyberShield_AI_Source_Code_Documentation.pdf")
    
    # Step 4: Copy to pdfs folder
    copy_to_pdfs_folder()
    print("\n[SUCCESS] All 3 deliverables generated and synchronized!")

if __name__ == "__main__":
    main()
