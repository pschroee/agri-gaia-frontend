// SPDX-FileCopyrightText: 2024 Osnabrück University of Applied Sciences
// SPDX-FileContributor: Andreas Schliebitz
// SPDX-FileContributor: Henri Graf
// SPDX-FileContributor: Jonas Tüpker
// SPDX-FileContributor: Lukas Hesse
// SPDX-FileContributor: Maik Fruhner
// SPDX-FileContributor: Prof. Dr.-Ing. Heiko Tapken
// SPDX-FileContributor: Tobias Wamhof
// SPDX-FileContributor: Philipp Schröer
//
// SPDX-License-Identifier: MIT

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback } from 'react';

import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select, { SelectChangeEvent } from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Button from '@mui/material/Button';
import Form from '@rjsf/mui';
import validator from '@rjsf/validator-ajv8';
import Chip from '@mui/material/Chip';
import SendIcon from '@mui/icons-material/Send';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/Upload';
import Link from '@mui/material/Link';
import Fab from '@mui/material/Fab';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import Box from '@mui/material/Box';
import IDataset from '../types/IDataset';
import { useReloadOnPlatformChange } from '../agent/platformChanges';
import { downloadBlob } from '../util';
import CodeEditor from '@uiw/react-textarea-code-editor';
import Autocomplete from '@mui/material/Autocomplete';
import TextField from '@mui/material/TextField';
import Alert from '@mui/material/Alert';
import AlertSnackbar from '../components/common/AlertSnackbar';
import TrainedModelsList from '../components/train/List';
import ITrainContainer from '../types/ITrainContainer';
import NoDataYet from '../components/common/NoDataYet';
import UploadTrainConfigDialog from '../components/train/UploadTrainConfigDialog';
import UploadTrainContainerTemplateDialog from '../components/train/UploadTrainContainerTemplateDialog';
import ExportConfigDialog from '../components/train/ExportConfigDialog';
import TrainContainerTemplateDeleteButton from '../components/train/TrainContainerTemplateDeleteButton';
import IAlertMessage from '../types/IAlertMessage';
import { useInterval } from '../util';
import UnarchiveIcon from '@mui/icons-material/Unarchive';

import useKeycloak from '../contexts/KeycloakContext';
import useApplicationTasks from '../contexts/TasksContext';
import {
    TRAIN_ARCHITECTURES_PATH,
    TRAIN_PROVIDERS_PATH,
    TRAIN_CONFIG_PATH,
    TRAIN_CONFIG_DOWNLOAD_PATH,
    TRAIN_CONFIG_EXPORT_PATH,
    TRAIN_CONTAINERS_PATH,
    DATASETS_PATH,
} from '../endpoints';
import { httpGet, httpPost, httpPut } from '../api';

export default function ModelTraining() {
    const keycloak = useKeycloak();
    const tasks = useApplicationTasks();

    const defaultProvider = 'Torchvision';
    const defaultArchitecture = { category: 'Classification', name: 'EfficientNet' };

    const [trainConfig, setTrainConfig] = useState<Record<string, any> | undefined>(undefined);
    const [exportConfig, setExportConfig] = useState<Record<string, any> | undefined>(undefined);
    const [exportConfigModalOpen, setExportConfigModalOpen] = useState<boolean>(false);
    const [providers, setProviders] = useState<Array<string>>([defaultProvider]);
    const [architectures, setArchitectures] = useState<Array<Record<string, string>>>([defaultArchitecture]);
    const [datasets, setDatasets] = useState<Array<IDataset> | undefined>(undefined);
    const [selectedDataset, setSelectedDataset] = useState<string>('');
    const [selectedProvider, setSelectedProvider] = useState<string>(defaultProvider);
    const [selectedArchitecture, setSelectedArchitecture] = useState<Record<string, string>>(defaultArchitecture);
    const [selectedContainerId, setSelectedContainerId] = useState<number | undefined>(undefined);
    const [errorMsg, setErrorMsg] = useState<string | undefined>(undefined);
    const [trainContainers, setTrainContainers] = useState<Array<ITrainContainer>>([]);
    const [username, setUsername] = useState<string | undefined>(undefined);
    const [modelTrainingInfoOpen, setModelTrainingInfoOpen] = useState<boolean>(true);
    const [uploadTrainConfigDialogOpen, setUploadTrainConfigDialogOpen] = useState<boolean>(false);
    const [uploadTrainContainerTemplateDialogOpen, setUploadTrainContainerTemplateDialogOpen] =
        useState<boolean>(false);
    const [snackbarMessage, setSnackbarMessage] = useState<IAlertMessage>({
        message: undefined,
        severity: undefined,
        open: false,
    });
    const [isConfigUpdate, setIsConfigUpdate] = useState<boolean>(false);
    const [exportEnabled, setExportEnabled] = useState<boolean>(false);
    const [isTrainContainerTemplateUpload, setIsTrainContainerTemplateUpload] = useState<boolean>(false);

    const beforeUnloadCallback = useCallback((e: any): string => {
        e.preventDefault();
        const unloadMessage =
            'Are you sure you want to leave this page? Your unsaved configuration changes may be lost.';
        e.returnValue = unloadMessage;
        return unloadMessage;
    }, []);

    const switchIsConfigUpdate = (enabled: boolean) => {
        setIsConfigUpdate(enabled);
        if (enabled) window.addEventListener('beforeunload', beforeUnloadCallback);
        else window.removeEventListener('beforeunload', beforeUnloadCallback);
    };

    const fetchUsername = async () => {
        if (keycloak?.authenticated && username === undefined) {
            keycloak.loadUserProfile().then((profile: { username?: string }) => {
                setUsername(profile.username);
            });
        }
    };

    document.documentElement.setAttribute('data-color-mode', 'light');

    useEffect(() => {
        setErrorMsg(undefined);
        fetchDatasets();
        fetchProviders();
        fetchTrainContainers();
        fetchUsername();
        fetchExportConfig();
    }, [keycloak]);

    useInterval(() => {
        fetchTrainContainers();
    }, 5);

    useEffect(() => {
        if (selectedProvider && !isConfigUpdate) fetchArchitectures(selectedProvider);
    }, [selectedProvider]);

    useEffect(() => {
        if (selectedArchitecture?.name && selectedProvider && !isConfigUpdate)
            fetchTrainConfig(selectedProvider, selectedArchitecture.name);
    }, [selectedArchitecture]);

    useEffect(() => {
        if (architectures?.length > 0 && !isTrainContainerTemplateUpload) setSelectedArchitecture(architectures[0]);
    }, [architectures]);

    useEffect(() => {
        if (providers?.length > 0 && !isTrainContainerTemplateUpload) setSelectedProvider(providers[0]);
    }, [providers]);

    const fetchTrainConfig = async (provider: string, architectureName: string) => {
        await httpGet(keycloak, `${TRAIN_CONFIG_PATH}/${provider}/${architectureName}`)
            .then((config) => {
                console.log(`Train config (schema + default values) for architecture ${architectureName}:`, config);
                setTrainConfig(config);
                setErrorMsg(undefined);
            })
            .catch((error) => {
                console.error(error);
                setErrorMsg(`Fetching train config: ${error.message}`);
            });
    };

    const fetchExportConfig = async () => {
        await httpGet(keycloak, `${TRAIN_CONFIG_EXPORT_PATH}`)
            .then((exportConfig) => {
                console.log(`Export config (schema + default values):`, exportConfig);
                setExportConfig(exportConfig);
                setErrorMsg(undefined);
            })
            .catch((error) => {
                console.error(error);
                setErrorMsg(`Fetching export config: ${error.message}`);
            });
    };

    const fetchProviders = async () => {
        await httpGet(keycloak, `${TRAIN_PROVIDERS_PATH}`)
            .then((_providers: Array<string>) => {
                console.log('Providers:', _providers);
                setProviders(_providers);
                setErrorMsg(undefined);
            })
            .catch((error) => {
                console.log(error);
                setErrorMsg(`Fetching providers: ${error.message}`);
            });
    };

    const fetchArchitectures = async (provider: string) => {
        await httpGet(keycloak, `${TRAIN_ARCHITECTURES_PATH}/${provider}`)
            .then((_architectures) => {
                console.log('Architectures:', _architectures);
                setArchitectures(_architectures);
                setErrorMsg(undefined);
            })
            .catch((error) => {
                console.log(error);
                setErrorMsg(`Fetching architectures: ${error.message}`);
            });
    };

    const fetchDatasets = async () => {
        await httpGet(keycloak, DATASETS_PATH)
            .then((_datasets) => {
                console.log('Datasets:', _datasets);
                setDatasets(_datasets);
            })
            .catch((error) => {
                console.log(error);
                setErrorMsg(`Fetching datasets: ${error.message}`);
            });
    };

    const fetchTrainContainers = async () => {
        await httpGet(keycloak, TRAIN_CONTAINERS_PATH)
            .then((_trainContainers) => {
                console.log('Train containers:', _trainContainers);
                setTrainContainers(_trainContainers);
            })
            .catch((error) => {
                console.log(error);
                setErrorMsg(`Fetching datasets: ${error.message}`);
            });
    };

    // the agent started or removed a training container, changed a dataset the dropdown shows, or a background
    // task ended (a container appears when the build task ends): reload both lists without leaving the page
    // (the 5 s interval stays)
    useReloadOnPlatformChange(['training', 'datasets', 'tasks'], () => {
        fetchDatasets();
        fetchTrainContainers();
    });

    const buildTrainContainer = async (config: Record<string, any>) => {
        await httpPost(
            keycloak,
            `${TRAIN_CONFIG_PATH}`,
            {
                provider: selectedProvider,
                category: selectedArchitecture.category,
                architecture: selectedArchitecture.name,
                dataset_id: +selectedDataset,
                train_config: config.train,
                export_config: config.export,
            },
            undefined,
            true,
        )
            .then(({ headers }) => {
                httpGet(keycloak, headers.get('Location'))
                    .then((task) => {
                        setSnackbarMessage({
                            message: `Train Container Buildjob "${selectedArchitecture.name} (${selectedProvider})" started.`,
                            severity: 'info',
                            open: true,
                        });
                        tasks?.addServerBackgroundTask(keycloak, tasks, task, () => {
                            console.log(`Successfully built train container.`);
                            fetchTrainContainers();
                        });
                    })
                    .catch((error) => {
                        setErrorMsg(`Train config submit: ${error.message}`);
                        console.log(error);
                    });
                setErrorMsg(undefined);
            })
            .catch((error) => {
                console.log(error);
            });
    };

    const updateTrainContainerConfig = async (config: Record<string, any>) => {
        await httpPut(
            keycloak,
            `${TRAIN_CONFIG_PATH}`,
            {
                train_config: config.train,
                export_config: config.export,
                dataset_id: +selectedDataset,
                container_id: selectedContainerId,
            },
            undefined,
            false,
        )
            .then(({ train_config, export_config, container }) => {
                fetchTrainContainers();
                setSnackbarMessage({
                    message: `Edited Train Container Configuration.`,
                    severity: 'success',
                    open: true,
                });
                console.log('Train config', train_config, 'of container', container, 'after edit.');
                console.log('Export config', export_config, 'of container', container, 'after edit.');
            })
            .catch((error) => {
                setErrorMsg(error.body.detail);
            })
            .finally(() => {
                switchIsConfigUpdate(false);
            });
    };

    const sendTrainConfig = async (config: Record<string, any>) => {
        if (!selectedProvider) {
            setErrorMsg('No provider selected.');
            return;
        }

        if (!selectedArchitecture) {
            setErrorMsg('No architecture selected.');
            return;
        }

        if (!selectedDataset) {
            setErrorMsg('No dataset selected.');
            return;
        }

        if (!exportEnabled) config.export = null;

        if (isConfigUpdate) {
            updateTrainContainerConfig(config);
        } else {
            buildTrainContainer(config);
        }
    };

    const downloadTrainConfig = async (config: Record<string, any>) => {
        await httpPost(keycloak, `${TRAIN_CONFIG_DOWNLOAD_PATH}`, {
            provider: selectedProvider,
            architecture: selectedArchitecture.name,
            train_config: config,
        })
            .then(({ blob, fileName }: { blob: Blob; fileName: string }) => {
                console.log(`Downloaded train configuration for architecture '${selectedArchitecture.name}'.`);
                downloadBlob(blob, fileName);
            })
            .catch((error) => {
                console.log(error);
                setErrorMsg(`Train config download: ${error.message}`);
            });
    };

    const CustomDescription = (props: any) => {
        const docsKeyword = 'Documentation:';
        if (props.description) {
            let description = props.description;
            let docUrl = undefined;

            if (props.description.includes(docsKeyword)) [description, docUrl] = props.description.split(docsKeyword);

            return (
                <Typography id={props.id} variant="subtitle2" style={{ marginTop: '5px' }}>
                    {description}
                    {docUrl && (
                        <>
                            {docsKeyword}{' '}
                            <Link href={docUrl} target="_blank" rel="noreferrer">
                                {docUrl}
                            </Link>
                        </>
                    )}
                </Typography>
            );
        }
        return null;
    };

    const configureEditView = ({ container_id, config, provider, architecture, dataset_id }: any) => {
        switchIsConfigUpdate(true);
        setSelectedProvider(provider);
        setSelectedArchitecture(architecture);
        setTrainConfig(config.train);
        setExportConfig(config.export);
        if (!config.export.empty) setExportEnabled(true);
        setSelectedDataset(dataset_id);
        setSelectedContainerId(container_id);
    };

    return (
        <>
            <Grid container justifyContent="space-between">
                <Grid item xs={6}>
                    <Typography variant="h4" component="h4">
                        Train Containers
                    </Typography>
                </Grid>
            </Grid>

            <Grid sx={{ mb: 5 }}>
                <TrainedModelsList
                    trainContainers={trainContainers}
                    username={username}
                    onDelete={fetchTrainContainers}
                    onRun={fetchTrainContainers}
                    onStop={fetchTrainContainers}
                    onModelTransfer={fetchTrainContainers}
                    onEdit={configureEditView}
                />
                <NoDataYet data={trainContainers} name="Train Containers" />
            </Grid>

            <Grid container justifyContent="space-between">
                <Grid item md={12} lg={4} sx={{ display: 'flex' }}>
                    <Typography variant="h4" component="h4" pr={1}>
                        Model Training
                    </Typography>
                    {isConfigUpdate ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Chip
                                size="small"
                                icon={<EditIcon />}
                                label="Edit Configuration"
                                color="info"
                                onDelete={() => {
                                    switchIsConfigUpdate(false);
                                    fetchTrainConfig(selectedProvider, selectedArchitecture.name);
                                }}
                            />
                        </Box>
                    ) : null}
                </Grid>

                <Grid item md={12} lg={8}>
                    <Grid container spacing={1} justifyContent="right">
                        <Grid item>
                            <Fab
                                color="primary"
                                aria-label="add"
                                size="small"
                                onClick={() => setUploadTrainContainerTemplateDialogOpen(true)}
                            >
                                <AddIcon />
                            </Fab>
                        </Grid>
                        <Grid item>
                            <TrainContainerTemplateDeleteButton
                                provider={selectedProvider}
                                architecture={selectedArchitecture.name}
                                onDelete={(deleteMessage: IAlertMessage) => {
                                    fetchProviders().then(() => fetchArchitectures(selectedProvider));
                                    setSnackbarMessage(deleteMessage);
                                }}
                            />
                        </Grid>
                        <Grid item>
                            <Fab
                                color="info"
                                aria-label="export"
                                size="small"
                                onClick={() => setExportConfigModalOpen(true)}
                            >
                                <UnarchiveIcon />
                            </Fab>
                        </Grid>
                        <Grid item md={12} lg={2} ml={2}>
                            <FormControl fullWidth variant="standard">
                                <InputLabel id="provider">Provider</InputLabel>
                                <Select
                                    labelId="provider"
                                    id="provider-select"
                                    value={selectedProvider}
                                    label="Provider"
                                    onChange={(event: SelectChangeEvent) => {
                                        switchIsConfigUpdate(false);
                                        const provider = event.target.value;
                                        setSelectedProvider(provider);
                                    }}
                                >
                                    {providers &&
                                        providers.map((provider) => (
                                            <MenuItem key={provider} value={provider}>
                                                {provider}
                                            </MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item md={12} lg={3}>
                            <FormControl fullWidth variant="standard">
                                <Autocomplete
                                    id="architecture-select"
                                    value={selectedArchitecture}
                                    options={architectures}
                                    groupBy={(architecture) => architecture.category}
                                    getOptionLabel={(architecture) => architecture.name}
                                    renderInput={(params) => (
                                        <TextField {...params} label="Architecture" variant="standard" />
                                    )}
                                    isOptionEqualToValue={(architecture, value) => architecture.name === value.name}
                                    onChange={(event: React.SyntheticEvent, architecture: any) => {
                                        switchIsConfigUpdate(false);
                                        if (architecture?.name) setSelectedArchitecture(architecture);
                                    }}
                                />
                            </FormControl>
                        </Grid>
                        <Grid item md={12} lg={3}>
                            <FormControl fullWidth variant="standard">
                                <InputLabel id="dataset">Dataset</InputLabel>
                                <Select
                                    labelId="dataset"
                                    id="dataset-select"
                                    value={selectedDataset}
                                    label="Dataset"
                                    onChange={(event: SelectChangeEvent) => {
                                        setSelectedDataset(event.target.value);
                                        setErrorMsg(undefined);
                                    }}
                                >
                                    {datasets &&
                                        datasets.map((dataset: IDataset) => (
                                            <MenuItem key={dataset.id} value={dataset.id}>
                                                {dataset.name}
                                            </MenuItem>
                                        ))}
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>
            <Grid container justifyContent="space-between" spacing={2} sx={{ mb: 4 }}>
                <Grid item xl={4} md={12} lg={6}>
                    {errorMsg && <Alert severity="error">{errorMsg}</Alert>}
                    {trainConfig && (
                        <Form
                            schema={trainConfig.schema}
                            validator={validator}
                            fields={{ DescriptionField: CustomDescription }}
                            onChange={(form) => {
                                setTrainConfig({ ...trainConfig, values: form.formData });
                            }}
                            onSubmit={(form) => sendTrainConfig({ train: form.formData, export: exportConfig?.values })}
                            formData={trainConfig.values}
                            liveOmit={true}
                            omitExtraData={true}
                            liveValidate={true}
                        >
                            {trainConfig && (
                                <Grid container spacing={1}>
                                    <Grid item xs={12} md={4}>
                                        <Button type="submit" variant="contained" endIcon={<SendIcon />}>
                                            {isConfigUpdate ? 'Edit Config' : 'Build Image'}
                                        </Button>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <Button
                                            variant="outlined"
                                            endIcon={<DownloadIcon />}
                                            onClick={() => downloadTrainConfig(trainConfig.values)}
                                        >
                                            Save Config
                                        </Button>
                                    </Grid>
                                    <Grid item xs={12} md={4}>
                                        <Button
                                            variant="outlined"
                                            endIcon={<UploadIcon />}
                                            onClick={() => setUploadTrainConfigDialogOpen(true)}
                                        >
                                            Load Config
                                        </Button>
                                    </Grid>
                                </Grid>
                            )}
                        </Form>
                    )}
                </Grid>
                <Grid item xl={8} md={12} lg={6} sx={{ mt: 3 }}>
                    {trainConfig && (
                        <CodeEditor
                            value={JSON.stringify(trainConfig.values, null, 4)}
                            language="json"
                            placeholder={`Loading training configuration...`}
                            onChange={(event) => {
                                try {
                                    const config = JSON.parse(event.target.value);
                                    setTrainConfig({ ...trainConfig, values: config });
                                    setErrorMsg(undefined);
                                } catch (error: any) {
                                    setErrorMsg(`${error.message}`);
                                }
                            }}
                            padding={15}
                            style={{
                                fontSize: 12,
                                fontFamily:
                                    'ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace',
                            }}
                        />
                    )}
                </Grid>
            </Grid>
            <AlertSnackbar
                message={
                    <Typography>
                        Create your own using the{' '}
                        <Link
                            href="https://github.com/hsos-ai-lab/agri-gaia-train-container-template"
                            target="_blank"
                            rel="noreferrer"
                        >
                            Agri-Gaia Train Container Template
                        </Link>
                        !
                    </Typography>
                }
                severity="info"
                open={modelTrainingInfoOpen}
                onClose={() => setModelTrainingInfoOpen(false)}
            />
            {uploadTrainConfigDialogOpen ? (
                <UploadTrainConfigDialog
                    provider={selectedProvider}
                    architecture={selectedArchitecture.name}
                    setTrainConfigValues={(trainConfigValues: any) =>
                        setTrainConfig({ ...trainConfig, values: trainConfigValues })
                    }
                    onUpload={(uploadMessage: IAlertMessage) => setSnackbarMessage(uploadMessage)}
                    handleClose={() => setUploadTrainConfigDialogOpen(false)}
                />
            ) : null}
            {uploadTrainContainerTemplateDialogOpen ? (
                <UploadTrainContainerTemplateDialog
                    onUpload={(uploadMessage: IAlertMessage, templateInfo: any) => {
                        if (uploadMessage.severity === 'success') {
                            console.log('Uploaded train container template:', templateInfo);
                            setIsTrainContainerTemplateUpload(true);
                            fetchProviders().then(() => {
                                setSelectedProvider(templateInfo.provider);
                                fetchArchitectures(templateInfo.provider).then(() => {
                                    setSelectedArchitecture(templateInfo.architecture);
                                    setIsTrainContainerTemplateUpload(false);
                                });
                            });
                        }
                        setSnackbarMessage(uploadMessage);
                    }}
                    handleClose={() => setUploadTrainContainerTemplateDialogOpen(false)}
                />
            ) : null}
            {exportConfigModalOpen ? (
                <ExportConfigDialog
                    exportConfig={exportConfig}
                    isConfigUpdate={isConfigUpdate}
                    exportEnabled={exportEnabled}
                    setExportEnabled={setExportEnabled}
                    setExportConfig={setExportConfig}
                    onSubmit={(exportConfigSaveMessage: IAlertMessage) => setSnackbarMessage(exportConfigSaveMessage)}
                    handleClose={() => setExportConfigModalOpen(false)}
                />
            ) : null}
            <AlertSnackbar
                message={snackbarMessage.message}
                severity={snackbarMessage.severity}
                open={snackbarMessage.open}
                onClose={() => setSnackbarMessage({ ...snackbarMessage, open: false })}
            />
        </>
    );
}
