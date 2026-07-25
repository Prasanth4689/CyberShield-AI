"""
CyberShield AI — Main Entry Point
===================================
Single command to train models or launch the dashboard.

Usage:
    python run.py train     — Run the full ML training pipeline
    python run.py serve     — Start the Flask API server + dashboard
    python run.py all       — Train models, then launch the dashboard
    python run.py           — Defaults to 'serve' (ideal for production / web hosting)
"""
import os
import sys
import subprocess
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("cybershield")

# Project root directory
PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))


def run_training():
    """Execute the full ML training pipeline."""
    logger.info("=" * 60)
    logger.info("  CyberShield AI — Training Pipeline")
    logger.info("=" * 60)

    train_script = os.path.join(PROJECT_DIR, "ml", "train_pipeline.py")

    if not os.path.exists(train_script):
        logger.error("Training script not found: %s", train_script)
        sys.exit(1)

    result = subprocess.run(
        [sys.executable, train_script],
        cwd=PROJECT_DIR,
        capture_output=False,
    )

    if result.returncode != 0:
        logger.error("Training pipeline failed with exit code %d", result.returncode)
        sys.exit(1)

    logger.info("Training pipeline completed successfully!")


def run_server():
    """Start the Flask API server and serve the dashboard."""
    logger.info("=" * 60)
    logger.info("  CyberShield AI — Starting Dashboard Server")
    logger.info("=" * 60)
    logger.info("  Dashboard: http://localhost:5000")
    logger.info("  API:       http://localhost:5000/api/health")
    logger.info("=" * 60)

    server_script = os.path.join(PROJECT_DIR, "backend", "app.py")

    if not os.path.exists(server_script):
        logger.error("Server script not found: %s", server_script)
        sys.exit(1)

    # Run the Flask server
    subprocess.run(
        [sys.executable, server_script],
        cwd=PROJECT_DIR,
    )


def main():
    """Parse command and execute the appropriate action."""
    # On hosting platforms (like Render), default to 'serve' to avoid OOM during build/start
    default_cmd = "serve" if os.environ.get("RENDER") or len(sys.argv) == 1 else "all"
    command = sys.argv[1].lower() if len(sys.argv) > 1 else default_cmd

    if command == "train":
        run_training()
    elif command == "serve":
        run_server()
    elif command == "all":
        run_training()
        run_server()
    else:
        print(__doc__)
        sys.exit(1)


if __name__ == "__main__":
    main()
