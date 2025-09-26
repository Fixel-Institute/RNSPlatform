/**
=========================================================
* UF BRAVO Platform
=========================================================

* Copyright 2025 by Jackson Cagle, Fixel Institute
* The source code is made available under a Creative Common NonCommercial ShareAlike License (CC BY-NC-SA 4.0) (https://creativecommons.org/licenses/by-nc-sa/4.0/) 

 =========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
*/

import { useEffect, useState, memo } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  Autocomplete,
  Card,
  Chip,
  Checkbox,
  Grid,
  Dialog,
  DialogContent,
  DialogActions,
  Divider,
  IconButton,
  Icon,
  Tabs,
  Tab,
  TextField,
  Table,
  TableHead,
  TableBody,
  TableCell,
  TableRow
} from "@mui/material";
import { createFilterOptions } from '@mui/material/Autocomplete';

import { AdapterMoment } from '@mui/x-date-pickers/AdapterMoment';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';

import FormField from "components/MDInput/FormField.js";
import MuiAlertDialog from "components/MuiAlertDialog";
import MDBox from "components/MDBox";
import MDTypography from "components/MDTypography";
import MDInput from "components/MDInput";
import MDButton from "components/MDButton";

import { FaCircleInfo, FaXmark } from "react-icons/fa6";

import routes from "routes.js";
import RecordingSelect from "./RecordingSelect";
import AddStudy from "./AddStudy";
import DatabaseLayout from "layouts/DatabaseLayout";

import { SessionController } from "database/session-control";
import { usePlatformContext, setContextState } from "context";
import LoadingProgress from "components/LoadingProgress";

const filter = createFilterOptions();

export default function StudyManagement() {
  const navigate = useNavigate();
  const [controller, dispatch] = usePlatformContext();
  const { user, language } = controller;

  const [alert, setAlert] = useState(null);
  const [availableStudies, setAvailableStudies] = useState([]);
  const [availableParticipants, setAvailableParticipants] = useState([]);
  const [activeStudy, setActiveStudy] = useState({Participants: [], InviteCode: "", Members: []});
  const [activeParticipant, setActiveParticipant] = useState({});
  const [studyInformation, setStudyInformation] = useState({});
  const [participantInformation, setParticipantInformation] = useState({show: false});
  const [addStudyInterface, setAddStudyInterface] = useState(false);

  const [uploadDataType, setUploadDataType] = useState("");
  
  useEffect(() => {
    SessionController.query("/api/queryParticipants", {
      ParticipantGroupId: user.InstituteId
    }).then((response) => {
      setAvailableParticipants(response.data);
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });

    SessionController.query("/api/manageStudyInformation", {
      RequestType: "GetStudies"
    }).then((response) => {
      setAvailableStudies(response.data);
      if (response.data.length == 0) {
        setStudyInformation({
          name: "", 
        })
        setActiveStudy({value: "create", label: "Create New Study"});
      } else {
        setActiveStudy({...response.data[0], value: response.data[0].Id, label: response.data[0].Name});
      }
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  }, []);

  const handleCreateStudy = () => {
    if (!studyInformation.name) {
      SessionController.displayError("Name is required.", setAlert);
      return;
    }

    SessionController.query("/api/manageStudyInformation", {
      RequestType: "CreateStudy",
      StudyName: studyInformation.name,
    }).then((response) => {
      setAvailableStudies((availableStudies) => [...availableStudies, response.data]);
      setActiveStudy({
        ...response.data,
        value: response.data.Id, label: response.data.Name
      });
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  };

  const handleLeaveStudy = (id) => {
    SessionController.query("/api/manageStudyInformation", {
      RequestType: "LeaveStudy",
      StudyId: id,
    }).then((response) => {
      setAvailableStudies((availableStudies) => {
        availableStudies = availableStudies.filter((a) => a.Id != id);
        if (availableStudies.length == 0) {
          setStudyInformation({
            name: "", 
          })
          setActiveStudy({value: "create", label: "Create New Study"});
        } else {
          setActiveStudy({...availableStudies[0], value: availableStudies[0].Id, label: availableStudies[0].Name});
        }
        return [...availableStudies];
      });
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  };

  const handleAddParticipant = (id, participant_uid) => {
    SessionController.query("/api/manageStudyInformation", {
      RequestType: "AddParticipant",
      StudyId: id,
      ParticipantId: participant_uid,
    }).then((response) => {
      
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  };

  const handleRemoveParticipant = (id, participant_uid) => {
    SessionController.query("/api/manageStudyInformation", {
      RequestType: "RemoveParticipant",
      StudyId: id,
      ParticipantId: participant_uid,
    }).then((response) => {
      
    }).catch((error) => {
      SessionController.displayError(error, setAlert);
    });
  };

  return (
    <DatabaseLayout>
      <MDBox pt={5}>
        <Card>
          {alert}
          <MDBox p={2}>
            <Grid container spacing={2}>
              <Grid item xs={12}>
                <MDBox display={"flex"} flexDirection={"row"} justifyContent={"space-between"}>
                  <MDBox>
                    <MDTypography variant="h3">
                      {"Study Manager"}
                    </MDTypography>
                    <MDTypography variant="h6">
                      {"Current Active Institute: " + user.Institute}
                    </MDTypography>
                  </MDBox>
                  <MDButton variant={"contained"} color={"success"} style={{marginLeft: "auto"}} onClick={() => setAddStudyInterface(true)}>
                    {"Join Study"}
                  </MDButton>
                </MDBox>
              </Grid>
              <Grid item sm={12}>
                <Autocomplete 
                  disableClearable
                  options={[{value: "create", label: "Create New Study"},
                    ...availableStudies.map((study) => ({...study, value: study.Id, label: study.Name})).sort((a,b) => a.label.localeCompare(b.label))]} 
                  value={activeStudy}
                  onChange={(event, newValue) => {
                    if (newValue.value == "create") {
                      setStudyInformation({
                        name: "", 
                      })
                    }
                    setActiveStudy(newValue);
                    setActiveParticipant({});
                  }}
                  getOptionLabel={(option) => {
                    if (typeof option === 'string') { return option; }
                    if (option.inputValue) { return option.label; }
                    if (!option.label) { return "Not Available" }
                    return option.label;
                  }}
                  isOptionEqualToValue={(option, value) => option.value == value.value}
                  renderOption={(props, option) => {
                    const { key, ...optionProps } = props;
                    return (
                      <MDBox key={key} component="li" sx={{ '& > img': { mr: 2, flexShrink: 0 } }} {...optionProps} >
                        {option.value === "batch-upload" || option.value === "create" ? (
                          <MDTypography variant="button" fontWeight="bold">
                            {option.label}
                          </MDTypography>
                        ) : (
                          <MDBox>
                            {option.label}
                          </MDBox>
                        )}
                      </MDBox>
                    );
                  }}
                  renderInput={(params) => (
                    <FormField {...params} label={"Available Studies"} InputLabelProps={{ shrink: true }} fullWidth />
                  )}
                />
              </Grid>
              {activeStudy.value == "create" ? (
                <Grid item sm={12}>
                  <Divider variant="insert" />
                  <MDTypography variant="h5">
                    {"Create New Study"}
                  </MDTypography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <TextField
                        variant="standard" margin="dense" id="study-name"
                        value={studyInformation.name}
                        onChange={(event) => setStudyInformation({...studyInformation, name: event.target.value})}
                        label={"Study Name (Required)"} type="text"
                        fullWidth
                      />
                    </Grid>
                    <Grid item xs={12} style={{marginTop: "auto"}}>
                      <MDButton variant={"contained"} color={"success"} style={{marginLeft: "auto"}} onClick={handleCreateStudy}>
                        {"Create Study"}
                      </MDButton>
                    </Grid>
                  </Grid>
                </Grid>
              ) : (
                <Grid item sm={12}>
                  <Grid container spacing={2}>
                    <Grid item sm={12} md={12} style={{display: "flex", flexDirection: "row"}}>
                      <TextField
                        variant="standard"
                        value={activeStudy.InviteCode}
                        label={"Study Invite Code"} type="text"
                        fullWidth disabled
                      />
                      <MDButton color={"info"} onClick={() => {
                        SessionController.query("/api/manageStudyInformation", {
                          RequestType: "ResetStudyCode",
                          StudyId: activeStudy.Id,
                        }).then((response) => {
                          setActiveStudy((activeStudy) => {
                            activeStudy.InviteCode = response.data;
                            setAvailableStudies((availableStudies) => {
                              for (let i in availableStudies) {
                                if (availableStudies[i].Id == activeStudy.Id) {
                                  availableStudies[i] = activeStudy;
                                }
                              }
                              return [...availableStudies];
                            });
                            return {...activeStudy};
                          });
                        }).catch((error) => {
                          SessionController.displayError(error, setAlert);
                        });
                      }} style={{marginLeft: 15}}>{"Refresh Invite Code"}</MDButton>
                    </Grid>

                    <Grid item sm={12}>
                      <MDTypography variant="h5">
                        {"Current Study Members"}
                      </MDTypography>
                    </Grid>
                    <Grid item sm={12}>
                      {activeStudy.Members.map((a, i) => {
                        return <MDBox key={a.Email} display={"flex"} flexDirection={"row"}>
                          <IconButton size="small" aria-label="close" color="inherit" onClick={() => {
                            
                          }}>
                            <FaCircleInfo />
                          </IconButton>
                          <MDTypography variant="h5">
                            {a.Name}{" ("}{a.Email}{")"}
                          </MDTypography>
                          <IconButton size="small" aria-label="close" color="error" onClick={() => {
                            SessionController.query("/api/manageStudyInformation", {
                              RequestType: "RemoveMember",
                              StudyId: activeStudy.Id,
                              Member: a.Email,
                            }).then((response) => {
                              setActiveStudy((activeStudy) => {
                                activeStudy.Members = activeStudy.Members.filter((b) => b.Email != a.Email);
                                setAvailableStudies((availableStudies) => {
                                  for (let i in availableStudies) {
                                    if (availableStudies[i].Id == activeStudy.Id) {
                                      availableStudies[i] = activeStudy;
                                    }
                                  }
                                  return [...availableStudies];
                                });
                                return {...activeStudy};
                              });
                            }).catch((error) => {
                              SessionController.displayError(error, setAlert);
                            });
                          }}>
                            <FaXmark />
                          </IconButton>
                        </MDBox>
                      })}
                    </Grid>
                    <Grid item sm={12}>
                      <Divider variant="middle" />
                    </Grid>
                    <Grid item sm={12}>
                      <MDTypography variant="h5">
                        {"Current Study Participant"}
                      </MDTypography>
                    </Grid>
                    <Grid item sm={12}>
                      <Autocomplete 
                        disableClearable
                        options={availableParticipants.map((participant) => ({...participant, value: participant.Id, label: participant.Name})).sort((a,b) => a.label.localeCompare(b.label))} 
                        value={activeParticipant}
                        onChange={(event, newValue) => {
                          setActiveStudy((activeStudy) => {
                            if (activeStudy.Participants.filter((a)=>a.Id == newValue.Id).length == 0) {
                              activeStudy.Participants.unshift({
                                Id: newValue.Id, Name: newValue.Name
                              });
                              handleAddParticipant(activeStudy.Id, newValue.Id);
                            }
                            return {...activeStudy};
                          });
                          setActiveParticipant(newValue);
                        }}
                        getOptionLabel={(option) => {
                          if (typeof option === 'string') { return option; }
                          if (option.inputValue) { return option.label; }
                          if (!option.label) { return "Not Available" }
                          return option.label;
                        }}
                        isOptionEqualToValue={(option, value) => option.value == value.value}
                        renderOption={(props, option) => {
                          const { key, ...optionProps } = props;
                          return (
                            <MDBox key={key} component="li" sx={{ '& > img': { mr: 2, flexShrink: 0 } }} {...optionProps} >
                              {option.value === "batch-upload" || option.value === "create" ? (
                                <MDTypography variant="button" fontWeight="bold">
                                  {option.label}
                                </MDTypography>
                              ) : (
                                <MDBox>
                                  {option.label}
                                </MDBox>
                              )}
                            </MDBox>
                          );
                        }}
                        renderInput={(params) => (
                          <FormField {...params} label={"Add Participant In Study"} InputLabelProps={{ shrink: true }} fullWidth />
                        )}
                      />
                    </Grid>
                    <Grid item sm={12}>
                      {activeStudy.Participants.map((a, i) => {
                        return <MDBox key={a.Id} display={"flex"} flexDirection={"row"}>
                          <IconButton size="small" aria-label="close" color="inherit" onClick={() => {
                            setParticipantInformation({
                              Participant: a,
                              show: true
                            })
                          }}>
                            <FaCircleInfo />
                          </IconButton>
                          <MDTypography variant="h5">
                            {a.Name}
                          </MDTypography>
                          <IconButton size="small" aria-label="close" color="error" onClick={() => {
                            setActiveStudy((activeStudy) => {
                              activeStudy.Participants = [...activeStudy.Participants.filter((b) => b.Id != a.Id)];
                              handleRemoveParticipant(activeStudy.Id, a.Id);
                              setAvailableStudies((availableStudies) => {
                                for (let i in availableStudies) {
                                  if (availableStudies[i].Id == activeStudy.Id) {
                                    availableStudies[i] = activeStudy;
                                  }
                                }
                                return [...availableStudies];
                              });
                              return {...activeStudy};
                            });
                          }}>
                            <FaXmark />
                          </IconButton>
                        </MDBox>
                      })}
                    </Grid>
                    <Grid item xs={12} style={{marginTop: "auto"}}>
                      <MDButton variant={"contained"} color={"error"} style={{marginLeft: "auto"}} onClick={() => handleLeaveStudy(activeStudy.Id)}>
                        {"Leave Study"}
                      </MDButton>
                    </Grid>
                  </Grid>
                </Grid>
              )}
            </Grid>
          </MDBox>
        </Card>
        {routes["StudyGroupAnalysis"] ? (
          <MDBox mb={3} mt={3}>
            <Grid container spacing={2}>
              <Grid item xs={12} display={"flex"} alignItems={"stretch"}>
                <MDTypography variant={"span"} fontSize={15} fontWeight={"bold"}>
                  {"Study Group Analysis"}
                </MDTypography>
              </Grid>
              {routes["StudyGroupAnalysis"].children.map((subreport) => {
                if (subreport.hide) return;
                return <Grid key={subreport.route} item xs={6} md={4} lg={3} xl={2} display={"flex"} alignItems={"stretch"}>
                  <Card sx={{width: "100%"}}>
                    <MDBox p={2} mx={3} display="flex" justifyContent="center">
                      <MDBox
                        display="grid" justifyContent="center" alignItems="center"
                        width="4rem" height="4rem"
                        shadow="md" borderRadius="lg" variant="gradient"
                      >
                        <Icon fontSize="large">
                          {subreport.icon}
                        </Icon>
                      </MDBox>
                    </MDBox>
                    <MDBox pb={6} px={2} textAlign="center" lineHeight={1.25}>
                      <MDTypography variant="h6" fontWeight="medium" textTransform="capitalize" mb={2}>
                        {subreport.name}
                      </MDTypography>
                    </MDBox>
                    <MDBox pb={2} px={2} lineHeight={1.25} sx={{position: "absolute", bottom: 0, width: "100%"}}>
                      <MDButton variant={"contained"} color={"info"} fullWidth onClick={() => {
                        navigate(subreport.route.replace(":study_uid", activeStudy.value), {replace: false});
                      }}>
                        {"View Analysis"}
                      </MDButton>
                    </MDBox>
                  </Card>
                </Grid>
              })}
            </Grid>
          </MDBox>
        ) : null}
      </MDBox>
      
      <Dialog open={participantInformation.show} onClose={() => setParticipantInformation({...participantInformation, show: false})} 
        PaperProps={{ sx: {minWidth: { xs: "100vw", sm: 1200 }} }}
      >
        <RecordingSelect participant={participantInformation.Participant} onSelectRecording={(recordings) => {
          setAlert(<LoadingProgress />)
          SessionController.query("/api/manageStudyInformation", {
            RequestType: "EditStudyAccessPermission",
            StudyId: activeStudy.Id,
            ParticipantId: participantInformation.Participant.Id,
            Permissions: recordings
          }).then((response) => {
            setActiveStudy((activeStudy) => {
              for (let b in activeStudy.Participants) {
                if (activeStudy.Participants[b].Id == participantInformation.Participant.Id) {
                  activeStudy.Participants[b].Permissions = recordings;
                }
              }
              setAvailableStudies((availableStudies) => {
                for (let i in availableStudies) {
                  if (availableStudies[i].Id == activeStudy.Id) {
                    availableStudies[i] = activeStudy;
                  }
                }
                return [...availableStudies];
              });
              return {...activeStudy};
            });
            setAlert(null);
          }).catch((error) => {
            SessionController.displayError(error, setAlert);
          });
        }} onClose={() => setParticipantInformation({...participantInformation, show: false})} setAlert={setAlert} />
      </Dialog>

      <Dialog open={addStudyInterface} onClose={() => setAddStudyInterface(false)} 
        PaperProps={{ sx: {minWidth: { xs: "100vw", sm: 600 }} }}
      >
        <AddStudy onAddStudy={(code) => {
          SessionController.query("/api/manageStudyInformation", {
            RequestType: "JoinStudy",
            StudyId: code,
          }).then((response) => {
            setAvailableStudies((availableStudies) => [...availableStudies, response.data]);
            setActiveStudy({
              ...response.data,
              value: response.data.Id, label: response.data.Name
            });
          }).catch((error) => {
            SessionController.displayError(error, setAlert);
          });
        }} onClose={() => setAddStudyInterface(false)} setAlert={setAlert} />
      </Dialog>

    </DatabaseLayout>
  );
}
