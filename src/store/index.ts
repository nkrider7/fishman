import { configureStore } from "@reduxjs/toolkit";
import tabsReducer from "./slices/tabsSlice";
import requestReducer from "./slices/requestSlice";
import responseReducer from "./slices/responseSlice";
import collectionsReducer from "./slices/collectionsSlice";
import historyReducer from "./slices/historySlice";
import settingsReducer from "./slices/settingsSlice";
import uiReducer from "./slices/uiSlice";
import scannerReducer from "./slices/scannerSlice";
import environmentReducer from "./slices/environmentSlice";
import scriptExecutionReducer from "./slices/scriptExecutionSlice";
import cookiesReducer from "./slices/cookiesSlice";
import workspaceReducer from "./slices/workspaceSlice";
import runnerReducer from "./slices/runnerSlice";
import collectionSettingsReducer from "./slices/collectionSettingsSlice";
import networkLogReducer from "./slices/networkLogSlice";
import gitReducer from "./slices/gitSlice";
import apiTestingReducer from "./slices/apiTestingSlice";
import { sendRequestThunk } from "./thunks/sendRequest";

export const store = configureStore({
  reducer: {
    tabs: tabsReducer,
    request: requestReducer,
    response: responseReducer,
    collections: collectionsReducer,
    history: historyReducer,
    settings: settingsReducer,
    ui: uiReducer,
    scanner: scannerReducer,
    environments: environmentReducer,
    scriptExecution: scriptExecutionReducer,
    cookies: cookiesReducer,
    workspaces: workspaceReducer,
    runner: runnerReducer,
    collectionSettings: collectionSettingsReducer,
    networkLog: networkLogReducer,
    git: gitReducer,
    apiTesting: apiTestingReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { sendRequestThunk };
