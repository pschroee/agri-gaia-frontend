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

import { useEffect, useState, useRef } from 'react';
import { httpGet } from '../api';
import { useReloadOnPlatformChange } from '../agent/platformChanges';
import useKeycloak from '../contexts/KeycloakContext';

import AddIcon from '@mui/icons-material/Add';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';

import InferenceContainerTemplateCreateDialog from '../components/inference-container-templates/InferenceContainerTemplateCreateDialog';
import InferenceContainerImageBuildDialog from '../components/inference-container-templates/InferenceContainerImageBuildDialog';
import InferenceContainerTemplateList from '../components/inference-container-templates/List';

import IInferenceContainerTemplate from '../types/IInferenceContainerTemplate';
import { INFERENCE_CONTAINER_TEMPLATES_PATH } from '../endpoints';
import NoDataYet from '../components/common/NoDataYet';
import Loading from '../components/common/Loading';
import InferenceContainerTemplateUpdateDialog from '../components/inference-container-templates/InferenceContainerTemplateUpdateDialog';

export default function InferenceContainerTemplateManagement() {
    const keycloak = useKeycloak();

    const [containerTemplates, setContainerTemplates] = useState<Array<IInferenceContainerTemplate>>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [selectedTemplate, setSelectedTemplate] = useState<IInferenceContainerTemplate | null>(null);

    const [createDialogOpen, setCreateDialogOpen] = useState(false);
    const [buildDialogOpen, setBuildDialogOpen] = useState(false);
    const [updateDialogOpen, setUpdateDialogOpen] = useState(false);

    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        };
    }, []);

    const fetchInferenceContainerTemplates = async (silent = false) => {
        if (mounted.current) {
            if (!silent) setIsLoading(true);
            httpGet(keycloak, INFERENCE_CONTAINER_TEMPLATES_PATH)
                .then((data) => {
                    setContainerTemplates(data);
                })
                .catch((error) => {
                    console.error(error);
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    };

    useEffect(() => {
        fetchInferenceContainerTemplates();
    }, [keycloak]);

    // the agent created a template (#167): load again without the loading state, the list stays in place
    useReloadOnPlatformChange('container-templates', () => fetchInferenceContainerTemplates(true));

    const handleCreateDialogOpen = () => {
        setCreateDialogOpen(true);
    };

    const onCreateDialogClose = () => {
        setCreateDialogOpen(false);
        fetchInferenceContainerTemplates();
    };
    const onBuildDialogClose = () => {
        setBuildDialogOpen(false);
        fetchInferenceContainerTemplates();
    };
    const onUpdateDialogClose = () => {
        setUpdateDialogOpen(false);
        fetchInferenceContainerTemplates();
    };

    const onBuildContainer = (containerTemplate: IInferenceContainerTemplate) => {
        setSelectedTemplate(containerTemplate);
        setBuildDialogOpen(true);
    };
    const onUpdateTemplate = (containerTemplate: IInferenceContainerTemplate) => {
        setSelectedTemplate(containerTemplate);
        setUpdateDialogOpen(true);
    };

    return (
        <>
            {createDialogOpen ? <InferenceContainerTemplateCreateDialog onClose={onCreateDialogClose} /> : null}
            {buildDialogOpen && selectedTemplate ? (
                <InferenceContainerImageBuildDialog
                    containerTemplate={selectedTemplate}
                    onClose={onBuildDialogClose}
                    onBuildCompleted={() => fetchInferenceContainerTemplates()}
                />
            ) : null}
            {updateDialogOpen && selectedTemplate ? (
                <InferenceContainerTemplateUpdateDialog
                    containerTemplate={selectedTemplate}
                    onClose={onUpdateDialogClose}
                />
            ) : null}
            <Grid container spacing={1} justifyContent="space-between">
                <Grid item xs={6}>
                    <Typography variant="h4" component="h4">
                        Inference Container Templates
                    </Typography>
                </Grid>
                <Grid item xs={6}>
                    <Fab
                        color="primary"
                        aria-label="create"
                        size="small"
                        sx={{ float: 'right' }}
                        onClick={handleCreateDialogOpen}
                    >
                        <AddIcon />
                    </Fab>
                </Grid>
            </Grid>
            <InferenceContainerTemplateList
                containerTemplates={containerTemplates}
                onDelete={() => fetchInferenceContainerTemplates()}
                onBuildContainer={onBuildContainer}
                onUpdateTemplate={onUpdateTemplate}
            />
            <NoDataYet data={containerTemplates} name="Containers" isLoading={isLoading} />
            <Loading isLoading={isLoading} />
        </>
    );
}
