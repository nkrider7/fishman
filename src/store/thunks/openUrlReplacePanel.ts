import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  openUrlReplace as openUrlReplaceAction,
  type UrlReplaceUiScope,
} from "../slices/uiSlice";
import { setSidebarCollapsed } from "../slices/settingsSlice";

/**
 * Open the VS Code–style Find & Replace URLs sidebar panel.
 * Expands the sidebar and switches to the url-replace view.
 */
export const openUrlReplacePanel = createAsyncThunk(
  "ui/openUrlReplacePanel",
  async (
    payload:
      | {
          scope?: UrlReplaceUiScope | null;
          findPrefill?: string | null;
        }
      | undefined,
    { dispatch },
  ) => {
    dispatch(setSidebarCollapsed(false));
    dispatch(openUrlReplaceAction(payload));
  },
);
