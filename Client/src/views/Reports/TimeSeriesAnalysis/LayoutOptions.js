/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import React, { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import {
  Backdrop,
  Dialog,
  DialogContent,
  DialogActions,
  Grid,
  Divider,
  Switch
} from "@mui/material"

import MDButton from "components/MDButton";
import MDTypography from "components/MDTypography";
import MDBox from "components/MDBox";

import { usePlatformContext, setContextState } from "context";

const toggleGroup = {
  "Neural Response from Effect of Stimulation": "StimulationPSDs",
  "Burst Dynamics": "BurstDynamics",
  "Event-Onset Spectrogram": "EventOnsetSpectrogram",
  "Event-State PSD": "EventStatePSD"
}

function LayoutOptions({show, close, setAlert}) {
  const [controller, dispatch] = usePlatformContext();  
  const { TimeSeriesAnalysisLayout, language } = controller;
  
  const handleStateChange = (type, state) => {
    setContextState(dispatch, "TimeSeriesAnalysisLayout", {...TimeSeriesAnalysisLayout, [type]: state});
  };

  return useMemo(() => (
    <Dialog open={show} onClose={() => close()}>
      <MDBox px={2} pt={2}>
        <MDTypography variant="h5">
          {"Time-series Analysis Layout Toggles"} 
        </MDTypography>
      </MDBox>
      <DialogContent>
        <MDBox px={2} pt={2}>
          <Grid container spacing={0}>
            {Object.keys(toggleGroup).map((key) => {
              return <Grid item key={key} xs={6} sx={{
                wordWrap: "break-word",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word"
              }}>
                <MDTypography fontSize={18} fontWeight={"bold"}>
                  {key}
                </MDTypography>
                <Switch checked={!TimeSeriesAnalysisLayout[toggleGroup[key]]} onChange={(event, checked) => handleStateChange(toggleGroup[key], !checked)} />
                <Divider variant="middle" />
              </Grid> 
            })}
          </Grid>
        </MDBox>
      </DialogContent>
      <DialogActions>
        <MDButton color="secondary" onClick={() => close()}>{"Close"}</MDButton>
      </DialogActions>
    </Dialog>
  ), [show, TimeSeriesAnalysisLayout]);
};

export default LayoutOptions;