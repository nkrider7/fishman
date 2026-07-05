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
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export { sendRequestThunk };
