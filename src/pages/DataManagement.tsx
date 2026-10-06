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

import { useEffect, useState } from 'react';
import { httpGet, httpPatch } from '../api';
import useKeycloak from '../contexts/KeycloakContext';

import IDataset from '../types/IDataset';

import AddIcon from '@mui/icons-material/Add';
import SyncIcon from '@mui/icons-material/Sync';
import DownloadIcon from '@mui/icons-material/Download';
import { Speed } from '@mui/icons-material';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';

import { DATASETS_DOWNLOAD_PATH, DATASETS_PATH, NETWORK_PATH } from '../endpoints';

import DatasetsList from '../components/datamanagement/List';
import UploadDatasetDialog from '../components/datamanagement/UploadDatasetDialog';
import ConvertDatasetDialog from '../components/datamanagement/ConvertDatasetDialog';
import NoDataYet from '../components/common/NoDataYet';
import AgrovocSearchbar from '../components/common/AgrovocSearchbar';
import React from 'react';
import { downloadBlob } from '../util';
import DatasetInferenceDialog from '../components/datamanagement/DatasetInferenceDialog';
import { usePublishPageSelection } from '../agent/pageSelection';

export default function DataManagement() {
    const keycloak = useKeycloak();

    const [datasets, setDatasets] = useState<Array<IDataset>>([]);
    const [username, setUsername] = useState<string | undefined>(undefined);
    const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);
    const [convertDialogOpen, setConvertDialogOpen] = useState<boolean>(false);
    const [inferenceDialogOpen, setInferenceDialogOpen] = useState(false);
    const [selected, setSelected] = React.useState<readonly number[]>([]);
    const [connectorAvailable, setConnectorAvailable] = useState<boolean>(false);

    // exactly one selected dataset is the agent's page context
    const selectedDataset = selected.length === 1 ? datasets.find((d) => d.id === selected[0]) : undefined;
    usePublishPageSelection(
        selectedDataset ? { kind: 'dataset', id: selectedDataset.id, name: selectedDataset.name } : undefined,
    );

    useEffect(() => {
        fetchConnectorInformation();
        fetchDatasets();
        fetchUsername();
    }, [keycloak]);

    const fetchUsername = async () => {
        if (keycloak?.authenticated && username === undefined) {
            keycloak.loadUserProfile().then((profile) => {
                setUsername(profile.username);
            });
        }
    };

    const fetchConnectorInformation = () => {
        httpGet(keycloak, NETWORK_PATH + '/info')
            .then((result) => {
                setConnectorAvailable(result['available']);
            })
            .catch((error) => {
                console.error(error);
            });
    };

    const fetchDatasets = async () => {
        httpGet(keycloak, DATASETS_PATH)
            .then((datasets: IDataset[]) => {
                datasets.sort((a, b) => a.name.localeCompare(b.name));
                setDatasets(datasets);
                console.log('Datasets:', datasets);
            })
            .catch((error) => {
                console.error(error);
            });
    };

    /*
    const fetchClasses = async () => {
        httpGet(keycloak, ONTOLOGY_PATH)
            .then((data) => {
                console.log(data);
            })
            .catch((error) => {
                console.error(error);
            });
    };

    const fetchAttributes = async () => {
        httpGet(keycloak, ONTOLOGY_PATH + '/gax-core:DataResource')
            .then((data) => {
                console.log(data);
            })
            .catch((error) => {
                console.error(error);
            });
    };*/

    const handleUploadDialogOpen = () => {
        setUploadDialogOpen(true);
    };

    const handleUploadDialogClose = () => {
        setUploadDialogOpen(false);
        fetchDatasets();
    };

    const handleConvertDialogOpen = () => {
        setConvertDialogOpen(true);
    };

    const handleConvertDialogClose = () => {
        setConvertDialogOpen(false);
    };

    const handleTogglePublic = (dataset_id: number) => {
        httpPatch(keycloak, DATASETS_PATH + `/${dataset_id}/toggle-public`)
            .then(() => {
                fetchDatasets();
                httpGet(keycloak, DATASETS_PATH + '/catalogue').then((result) => {
                    console.log(result);
                });
            })
            .catch((error) => {
                console.error(error);
            });
    };

    const handleInferenceDialogOpen = () => {
        setInferenceDialogOpen(true);
    };

    const handleInferenceDialogClose = () => {
        setInferenceDialogOpen(false);
        fetchDatasets();
    };

    const downloadDatasets = async () => {
        for (const datasetId in selected) {
            httpGet(keycloak, `${DATASETS_PATH}/${selected[datasetId]}${DATASETS_DOWNLOAD_PATH}`)
                .then(({ blob, fileName }) => {
                    downloadBlob(blob, fileName);
                })
                .catch((error) => {
                    console.error(error);
                });
        }
    };

    return (
        <>
            {uploadDialogOpen ? <UploadDatasetDialog handleClose={handleUploadDialogClose} /> : null}
            {convertDialogOpen ? <ConvertDatasetDialog handleClose={handleConvertDialogClose} /> : null}
            {inferenceDialogOpen ? (
                <DatasetInferenceDialog datasetIds={selected} handleClose={handleInferenceDialogClose} />
            ) : null}

            <Grid container justifyContent="space-between">
                <Grid item md={12} lg={6}>
                    <Typography variant="h4" component="h4">
                        Datasets
                    </Typography>
                </Grid>

                <Grid item md={12} lg={6}>
                    <Grid container spacing={1} justifyContent="right" alignItems={'center'}>
                        <Grid item alignItems={'center'}>
                            {selected.length ? (
                                <Typography variant="h6">
                                    {selected.length + ' Dataset' + (selected.length == 1 ? '' : 's') + ' selected'}
                                </Typography>
                            ) : null}
                        </Grid>
                        <Grid item>
                            <Fab
                                color="primary"
                                aria-label="add"
                                size="small"
                                sx={{ float: 'right' }}
                                disabled={!selected.length}
                                onClick={handleInferenceDialogOpen}
                            >
                                <Speed />
                            </Fab>
                        </Grid>
                        <Grid item>
                            <Fab
                                color="primary"
                                aria-label="add"
                                size="small"
                                sx={{ float: 'right' }}
                                disabled={!selected.length}
                                onClick={downloadDatasets}
                            >
                                <DownloadIcon />
                            </Fab>
                        </Grid>
                        <Grid item>
                            <Fab
                                color="primary"
                                aria-label="add"
                                size="small"
                                sx={{ float: 'right' }}
                                onClick={handleUploadDialogOpen}
                            >
                                <AddIcon />
                            </Fab>
                        </Grid>
                        <Grid item>
                            <Fab
                                color="info"
                                aria-label="convert"
                                size="small"
                                sx={{ float: 'right' }}
                                onClick={handleConvertDialogOpen}
                            >
                                <SyncIcon />
                            </Fab>
                        </Grid>
                    </Grid>
                </Grid>
            </Grid>

            <AgrovocSearchbar searchRoute={DATASETS_PATH} handleResponse={setDatasets} resetResult={fetchDatasets} />

            <DatasetsList
                datasets={datasets}
                username={username}
                connectorAvailable={connectorAvailable}
                onDelete={fetchDatasets}
                onTogglePublic={handleTogglePublic}
                selected={selected}
                setSelected={setSelected}
            />
            <NoDataYet data={datasets} name="Datasets" />
        </>
    );
}
