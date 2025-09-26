/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  Autocomplete,
  Dialog,
  DialogContent,
  TextField,
  Card,
  Icon,
  Drawer,
  SpeedDial,
  SpeedDialAction,
  SpeedDialIcon,
  Grid,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox,
  IconButton,
  InputLabel,
  Input,
} from "@mui/material"

import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDButton from "components/MDButton";
import MuiAlertDialog from "components/MuiAlertDialog";

import { IoMdCheckmarkCircle } from "react-icons/io";

import { SessionController } from "database/session-control";
import { select } from "react-cookies";

function RecordingSelect({recordings, existingGroups, name, currentSelect, onClose, onSelectRecording}) {
  const { participant_uid } = useParams();

  const [groupName, setGroupName] = useState(name);
  const [selectedRecording, setSelectedRecording] = useState(currentSelect);
  const [recordingType, setRecordingType] = useState({active: "", options: []});
  const [recordingDate, setRecordingDate] = useState({active: "", options: []});
  const [availableRecordings, setAvailableRecordings] = useState([]);

  useEffect(() => {
    SessionController.query("/api/queryParticipantSurveyRecords", {
      RequestType: "RequestAll",
      ParticipantId: participant_uid
    }).then((response) => {
      
    });
  }, []);

  useEffect(() => {
    setRecordingType(() => {
      let recordingTypes = [];
      for (let i in recordings) {
        if (!recordingTypes.includes(recordings[i].Type)) {
          recordingTypes.push(recordings[i].Type);
        }
      }
      if (existingGroups.length > 0) {
        recordingTypes.push("Processed Output")
      }
      if (recordingTypes.length > 0) return {active: recordingTypes[0], options: recordingTypes};
      return {active: "", options: []};
    });
  }, [recordings])

  useEffect(() => {
    setRecordingDate(() => {
      let recordingDates = [];
      const recordingsSorted = recordings.sort((a,b) => a.Date - b.Date);
      for (let i in recordingsSorted) {
        if (recordingsSorted[i].Type == recordingType.active) {
          const dateString = new Date(recordingsSorted[i].Date*1000).toLocaleString("en-US", {...SessionController.getTimezoneName(recordingsSorted[i].Timezone),
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZoneName: "longGeneric"
          })

          if (!recordingDates.includes(dateString)) {
            recordingDates.push(dateString);
          }
        }
      }

      if (recordingType.active == "Processed Output") {
        recordingDates.push("All");
        for (let i in existingGroups) {
          
        }
      }

      if (recordingDates.length > 0) return {active: recordingDates[0], options: recordingDates};
      return {active: "", options: []};
    });
  }, [recordingType.active])

  useEffect(() => {
    setAvailableRecordings(() => {
      let availableRecordings = [];
      for (let i in recordings) {
        if (recordings[i].Type == recordingType.active) {
          const dateString = new Date(recordings[i].Date*1000).toLocaleString("en-US", {...SessionController.getTimezoneName(recordings[i].Timezone),
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            timeZoneName: "longGeneric"
          })

          if (recordingDate.active == dateString) {
            availableRecordings.push(recordings[i]);
          }
        }
      }
      
      if (recordingType.active == "Processed Output") {
        for (let i in existingGroups) {
          availableRecordings.push({
            Name: existingGroups[i].name,
            Id: existingGroups[i].id,
          });
        }
      }

      return availableRecordings;
    });
  }, [recordingType.active, recordingDate.active]);

  return (
    <DialogContent>
      <MDBox px={2} pt={2}>
        <MDTypography variant="h5">
          {"Add Recordings to Analysis"}
        </MDTypography>
        
        <TextField variant="standard" label={"Recording Group Name"} fullWidth
          placeholder={"New Recording Group"}
          value={groupName}
          onChange={(event) => setGroupName(event.target.value)}
        />
      </MDBox>
      
      <MDBox px={2} pt={2}>
        <Autocomplete selectOnFocus clearOnBlur disableClearable
          renderInput={(params) => (
            <TextField {...params} variant="standard" label={"Select Recording Type"}/>
          )}
          isOptionEqualToValue={(option, value) => {
            return option === value;
          }}
          renderOption={(props, option) => <li {...props}>{option}</li>}
          value={recordingType.active}
          options={recordingType.options}
          onChange={(event, newValue) => setRecordingType({...recordingType, active: newValue})}
        />
      </MDBox>
      
      <MDBox px={2} pt={2}>
        <Autocomplete selectOnFocus clearOnBlur disableClearable
          renderInput={(params) => (
            <TextField {...params} variant="standard" label={"Select Recording Date"}/>
          )}
          isOptionEqualToValue={(option, value) => {
            return option === value;
          }}
          renderOption={(props, option) => <li {...props}>{option}</li>}
          value={recordingDate.active}
          options={recordingDate.options}
          onChange={(event, newValue) => setRecordingDate({...recordingDate, active: newValue})}
        />
      </MDBox>
      
      <MDBox px={2} pt={2}>
        <Grid container spacing={1}>
          {availableRecordings.map((a) => (
            <Grid item key={a.Id} xs={6} sm={4} md={3}>
              <Card style={selectedRecording.includes(a.Id) ? {background: "#4caf50", cursor: "pointer"} : {cursor: "pointer"}} onClick={() => {
                setSelectedRecording((selectedRecording) => {
                  if (selectedRecording.includes(a.Id)) {
                    selectedRecording = selectedRecording.filter((b) => b != a.Id);
                  } else {
                    selectedRecording.push(a.Id);
                  }
                  return [...selectedRecording];
                })
              }}>
                {selectedRecording.includes(a.Id) ? (
                  <IoMdCheckmarkCircle color={"#357a38"} style={{position: "absolute", transform: "translate(-50%, -50%)", borderRadius: "50%"}} />
                ) : null}
                <MDBox p={2}>
                  <MDTypography variant={"h5"} fontWeight={"bold"}>
                    {a.Name.length > 0 ? a.Name : a.Id}
                  </MDTypography>
                  {a.Date ? (
                    <MDTypography variant={"p"} fontSize={15}>
                      {new Date(a.Date*1000).toLocaleString("en-US", {...SessionController.getTimezoneName(a.Timezone),
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })} {"-"} 
                      {new Date(a.Date*1000 + a.Metadata.Duration*1000).toLocaleString("en-US", {...SessionController.getTimezoneName(a.Timezone),
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </MDTypography>
                  ) : null}
                </MDBox>
              </Card>
            </Grid>
          ))}
        </Grid>

      </MDBox>
      <MDBox p={2}>
        <MDButton color={"secondary"} 
          onClick={onClose}
        >
          Cancel
        </MDButton>
        <MDButton color={"info"} 
          onClick={() => {
            onSelectRecording(selectedRecording, groupName);
          }} style={{marginLeft: 10}}
        >
          Update
        </MDButton>
      </MDBox>
    </DialogContent>
  )
}

export default RecordingSelect;