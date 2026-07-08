import type { LanguagePlugin } from "../core/types";
import { fastapiScanner } from "../plugins/python/fastapi/fastapi-scanner";
import { flaskScanner } from "../plugins/python/flask/flask-scanner";
import { djangoScanner } from "../plugins/python/django/django-scanner";

const PYTHON_FRAMEWORKS = [
  fastapiScanner,
  flaskScanner,
  djangoScanner,
];

const PYTHON_MARKERS = [
  "pyproject.toml",
  "requirements.txt",
  "Pipfile",
  "poetry.lock",
  "setup.py",
  "Pipfile.lock",
];

export const pythonLanguagePlugin: LanguagePlugin = {
  id: "python",
  name: "Python",
  async detect(ctx) {
    for (const marker of PYTHON_MARKERS) {
      const markerPath = await ctx.fs.join(ctx.projectPath, marker);
      if (await ctx.fs.exists(markerPath)) return true;
    }
    const managePy = await ctx.fs.join(ctx.projectPath, "manage.py");
    if (await ctx.fs.exists(managePy)) return true;
    return false;
  },
  getFrameworkPlugins() {
    return PYTHON_FRAMEWORKS;
  },
};
