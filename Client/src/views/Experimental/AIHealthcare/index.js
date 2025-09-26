/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Autocomplete,
  Drawer,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Card,
  Grid,
  IconButton,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Slider
} from "@mui/material"

import { 
  ChevronRight as ChevronRightIcon,
  Settings as SettingsIcon,
  KeyboardDoubleArrowUp as KeyboardDoubleArrowUpIcon, 
  Dashboard as DashboardIcon
} from "@mui/icons-material";

// core components
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import LoadingProgress from "components/LoadingProgress";
import MuiAlertDialog from "components/MuiAlertDialog";
import FormField from "components/MDInput/FormField";

import DatabaseLayout from "layouts/DatabaseLayout";
import ConfigurationDialog from "components/ConfigurationDialog";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context.js";
import { dictionary, dictionaryLookup } from "assets/translation.js";

function AIHealthcare() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { language } = controller;
  const { participant_uid } = useParams();

  const [availableModels, setAvailableModels] = useState({active: "", options: []});
  const [recordingList, setRecordingList] = useState({active: null, options: []});

  const [drawerOpen, setDrawerOpen] = useState({open: false, config: {}});
  const [alert, setAlert] = useState(null);

  useEffect(() => {
    if (!participant_uid) {
      navigate("/dashboard", {replace: false});
      return;
    }
    setContextState(dispatch, "report", "CustomizedAnalysis");

    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryAIModels", {
      RequestType: "RequestAll",
      ParticipantId: participant_uid
    }).then((response) => {
      setAvailableModels({active: "", options: response.data});
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }, [participant_uid]);

  useEffect(() => {
    if (availableModels.active === "") return;

    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryAIModels", {
      RequestType: "RequestQualifyRecordings",
      ParticipantId: participant_uid,
      ModelType: availableModels.active
    }).then((response) => {
      setRecordingList({active: null, options: response.data.map((a) => {
        a.Label = new Date(a.Date*1000).toLocaleString();
        return a;
      })});
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }, [participant_uid, availableModels.active]);

  useEffect(( ) => {
    if (!recordingList.active) return;

    setAlert(<LoadingProgress/>);
    SessionController.query("/api/queryAIModels", {
      RequestType: "RequestAIResult",
      ParticipantId: participant_uid,
      ModelType: availableModels.active,
      RecordingId: recordingList.active.Id
    }).then((response) => {
      setAlert(null);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
    
  }, [recordingList.active])

  return (
    <DatabaseLayout>
      {alert}
      <MDBox pt={3}>
        <MDBox>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Card sx={{width: "100%"}}>
                <Grid container>
                  <Grid item xs={12}>
                    <MDBox p={2} lineHeight={1}>
                      <Autocomplete
                        value={availableModels.active}
                        options={availableModels.options}
                        onChange={(event, value) => {
                          setAvailableModels({...availableModels, active: value});
                        }}
                        renderInput={(params) => (
                          <FormField
                            {...params}
                            label={"Available AI Models on Server"}
                            InputLabelProps={{ shrink: true }}
                          />
                        )}
                      />
                    </MDBox>
                    {recordingList.options.length > 0 ? (
                    <MDBox p={2} lineHeight={1}>
                      <Autocomplete
                        value={recordingList.active}
                        options={recordingList.options}
                        isOptionEqualToValue={(option, value) => {
                          return option.Id === value.Id;
                        }}
                        renderOption={(props, option) => <li {...props}>{option.Label}</li>}
                        getOptionLabel={(option) => option.Label}
                        onChange={(event, value) => setRecordingList({...recordingList, active: value})}
                        renderInput={(params) => (
                          <FormField
                            {...params}
                            label={"Applicable Recording List"}
                            InputLabelProps={{ shrink: true }}
                          />
                        )}
                      />
                    </MDBox>
                    ) : null}
                  </Grid>
                </Grid>
              </Card>
            </Grid>
            <Grid item xs={12}>
              
            </Grid>
          </Grid>
        </MDBox>
      </MDBox>
    </DatabaseLayout>
  );
}

export default AIHealthcare;
