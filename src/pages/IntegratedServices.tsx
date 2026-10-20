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
import { httpGet, httpPatch } from '../api';
import { useReloadOnPlatformChange } from '../agent/platformChanges';
import useKeycloak from '../contexts/KeycloakContext';

import AddIcon from '@mui/icons-material/Add';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Fab from '@mui/material/Fab';

import ServiceInputs from '../components/integrated-services/ServiceInputs';
import IntegratedServiceList from '../components/integrated-services/List';
import UploadServiceDialog from '../components/integrated-services/UploadServiceDialog';
import IIntegratedService from '../types/IIntegratedService';
import { INTEGRATED_SERVICES_PATH } from '../endpoints';
import NoDataYet from '../components/common/NoDataYet';
import CircularProgress from '@mui/material/CircularProgress';

import ExportServiceDialog from '../components/integrated-services/ExportServiceDialog';
import SwaggerUI from '../components/integrated-services/SwaggerUI';

export default function IntegratedServices() {
    const keycloak = useKeycloak();

    const [integratedServices, setIntegratedServices] = useState<Array<IIntegratedService>>([]);
    //const [integratedServices, setIntegratedServices] = useState<[]>([]);
    const [integratedServiceDialogOpen, setIntegratedServiceDialogOpen] = useState(false);
    const [swaggerDialogOpen, setSwaggerDialogOpen] = useState(false);
    const [explorerOpen, setExplorerOpen] = useState(false);
    const [integratedServicesAreLoading, setIntegratedServicesAreLoading] = useState(false);
    const [uploadDialogOpen, setUploadDialogOpen] = useState<boolean>(false);
    const [exportDialogOpen, setExportDialogOpen] = useState<boolean>(false);
    const [activeServiceId, setActiveServiceId] = useState<number>(0);
    const [activeServiceName, setActiveServiceName] = useState<string>('');
    const [serviceInfo, setServiceInfo] = useState<JSON>({} as JSON);
    const [serviceSpec, setServiceSpec] = useState<JSON>({} as JSON);
    const [explorerFiles, setExplorerFiles] = useState();
    const didMount = useRef(false);

    const fetchIntegratedServices = async (silent = false) => {
        if (!silent) setIntegratedServicesAreLoading(true);
        httpGet(keycloak, INTEGRATED_SERVICES_PATH)
            .then((data) => {
                console.log(data);
                setIntegratedServices(data);
            })
            .catch((error) => {
                console.error(error);
            })
            .finally(() => setIntegratedServicesAreLoading(false));
    };

    useEffect(() => {
        fetchIntegratedServices();
    }, [keycloak]);

    // an agent call on /integrated-services changed the list (#167): load again without the loading state
    useReloadOnPlatformChange('integrated-services', () => fetchIntegratedServices(true));

    const handleIntegratedServiceDialogOpen = () => {
        setIntegratedServiceDialogOpen(true);
    };

    const handleIntegratedServiceDialogClose = () => {
        setActiveServiceName('');
        setServiceInfo({} as JSON);
        setIntegratedServiceDialogOpen(false);
        //fetchIntegratedServices();
    };

    const handleSwaggerDialogClose = () => {
        setActiveServiceName('');
        setServiceSpec({} as JSON);
        setSwaggerDialogOpen(false);
        //fetchIntegratedServices();
    };

    const handleUploadDialogOpen = () => {
        setUploadDialogOpen(true);
    };

    const handleUploadDialogClose = () => {
        setUploadDialogOpen(false);
        fetchIntegratedServices();
    };

    const handleExportDialogOpen = () => {
        setExportDialogOpen(true);
    };

    const handleExportDialogClose = () => {
        setExportDialogOpen(false);
        fetchIntegratedServices();
    };

    const handleExplorerClose = () => {
        setExplorerOpen(false);
        setExplorerFiles(undefined);
    };

    const getServiceInfo = (service_name: string) => {
        setActiveServiceName(service_name);

        httpGet(keycloak, `${INTEGRATED_SERVICES_PATH}/${service_name}/info`)
            .then((response) => {
                setServiceInfo(response);
                console.log(response);
                setIntegratedServiceDialogOpen(true);
            })
            .catch((error) => {
                console.error(error);
            });

        setIntegratedServiceDialogOpen(true);
    };

    const getServiceSpec = (service_name: string) => {
        setActiveServiceName(service_name);

        httpGet(keycloak, `${INTEGRATED_SERVICES_PATH}/${service_name}/openapi`)
            .then((response) => {
                setServiceSpec(response);
                console.log(response);
                setSwaggerDialogOpen(true);
            })
            .catch((error) => {
                console.error(error);
            });

        setSwaggerDialogOpen(true);
    };

    const handleTogglePublic = (service_id: number) => {
        httpPatch(keycloak, INTEGRATED_SERVICES_PATH + `/${service_id}/toggle-public`)
            .then(() => {
                fetchIntegratedServices();
            })
            .catch((error) => {
                console.error(error);
            });
    };

    return (
        <>
            <Grid container spacing={2} justifyContent="space-between">
                <Grid item xs={6}>
                    <Typography variant="h4" component="h4">
                        Integrated Services
                    </Typography>
                </Grid>
            </Grid>
            <Grid item md={12} lg={6}>
                <Grid container spacing={1} justifyContent={'right'}>
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
                </Grid>
            </Grid>

            {integratedServicesAreLoading ? (
                <Grid container justifyContent="center">
                    <Grid item xs={1}>
                        <CircularProgress color="primary" />
                    </Grid>
                </Grid>
            ) : (
                <>
                    <IntegratedServiceList
                        integratedServices={integratedServices}
                        onTogglePublic={handleTogglePublic}
                        createServiceInput={getServiceInfo}
                        getServiceSpec={getServiceSpec}
                        onDelete={() => fetchIntegratedServices()}
                        setExportDialogOpen={handleExportDialogOpen}
                    />
                    <NoDataYet data={integratedServices} name="Integrated Services" />
                </>
            )}
            {swaggerDialogOpen ? (
                <SwaggerUI
                    handleClose={handleSwaggerDialogClose}
                    apiSpec={serviceSpec}
                    service_name={activeServiceName}
                />
            ) : null}
            {integratedServiceDialogOpen ? (
                <ServiceInputs
                    serviceInfo={serviceInfo}
                    setServiceInfo={setServiceInfo}
                    handleClose={handleIntegratedServiceDialogClose}
                    service_id={activeServiceId}
                    service_name={activeServiceName}
                />
            ) : null}
            {uploadDialogOpen ? <UploadServiceDialog handleClose={handleUploadDialogClose} /> : null}
            {exportDialogOpen ? <ExportServiceDialog handleClose={handleExportDialogClose} /> : null}
        </>
    );
}
