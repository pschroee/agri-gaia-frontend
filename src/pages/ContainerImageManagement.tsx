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
import useKeycloak from '../contexts/KeycloakContext';

import DownloadIcon from '@mui/icons-material/Download';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';

import ContainerImageDownloadDialog from '../components/containers-images/ContainerImageDownloadDialog';
import ContainerImageDeployDialog from '../components/containers-images/ContainerImageDeployDialog';
import ContainerImagesList from '../components/containers-images/List';

import IContainerImage from '../types/IContainerImage';
import { useReloadOnPlatformChange } from '../agent/platformChanges';
import { CONTAINER_IMAGES_PATH } from '../endpoints';
import NoDataYet from '../components/common/NoDataYet';
import Loading from '../components/common/Loading';

export default function ContainerManagement() {
    const keycloak = useKeycloak();

    const [containerImages, setContainerImages] = useState<Array<IContainerImage>>([]);
    const [selectedContainerImage, setSelectedContainerImage] = useState<IContainerImage | undefined>(undefined);
    const [isLoading, setIsLoading] = useState<boolean>(false);

    const [downloadDialogOpen, setDownloadDialogOpen] = useState(false);
    const [deployDialogOpen, setDeployDialogOpen] = useState(false);

    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;

        return () => {
            mounted.current = false;
        };
    }, []);

    const fetchContainerImages = async () => {
        if (mounted.current) {
            setIsLoading(true);
            httpGet(keycloak, CONTAINER_IMAGES_PATH)
                .then((data) => {
                    data = data.filter((containerImage: IContainerImage) => !containerImage.tag.endsWith('-train'));
                    setContainerImages(data);
                })
                .catch((error) => {
                    console.error(error);
                })
                .finally(() => {
                    setIsLoading(false);
                });
        }
    };

    // the agent built or removed a container image: show the new list without leaving the page
    useReloadOnPlatformChange('images', fetchContainerImages);

    useEffect(() => {
        fetchContainerImages();
    }, [keycloak]);

    const handleDownloadDialogOpen = () => {
        setDownloadDialogOpen(true);
    };

    const handleDownloadDialogClose = () => {
        setDownloadDialogOpen(false);
        fetchContainerImages();
    };

    const handleDeployDialogClose = () => {
        setDeployDialogOpen(false);
        fetchContainerImages();
    };

    const deployContainer = (containerImage: IContainerImage) => {
        setSelectedContainerImage(containerImage);
        setDeployDialogOpen(true);
    };

    return (
        <>
            {downloadDialogOpen ? (
                <ContainerImageDownloadDialog
                    handleClose={handleDownloadDialogClose}
                    onDownload={fetchContainerImages}
                />
            ) : null}
            {deployDialogOpen && selectedContainerImage ? (
                <ContainerImageDeployDialog
                    containerImage={selectedContainerImage}
                    handleClose={handleDeployDialogClose}
                />
            ) : null}
            <Grid container spacing={1} justifyContent="space-between">
                <Grid item xs={6}>
                    <Typography variant="h4" component="h4">
                        Container Images
                    </Typography>
                </Grid>
                <Grid item xs={6}>
                    <Fab
                        color="primary"
                        aria-label="add"
                        size="small"
                        sx={{ float: 'right', mr: 2 }}
                        onClick={handleDownloadDialogOpen}
                    >
                        <DownloadIcon />
                    </Fab>
                </Grid>
            </Grid>
            <ContainerImagesList
                containerImages={containerImages}
                onDelete={fetchContainerImages}
                deployContainer={deployContainer}
            />
            <NoDataYet data={containerImages} name="Containers" isLoading={isLoading} />
            <Loading isLoading={isLoading} />
        </>
    );
}
