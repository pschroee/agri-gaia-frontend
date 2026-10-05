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

import { BrowserRouter, Routes, Route } from 'react-router-dom';

import CssBaseline from '@mui/material/CssBaseline';

import { KeycloakProvider } from './contexts/KeycloakContext';
import { CvatProvider } from './contexts/CvatContext';

import Debug from './pages/Debug';
import Docker from './pages/Docker';
import DataManagement from './pages/DataManagement';
import Network from './pages/Network';
import ModelManagement from './pages/ModelManagement';
import ModelTraining from './pages/ModelTraining';
import EdgeManagement from './pages/EdgeManagement';
import EdgeGroups from './pages/EdgeGroups';
import IntegratedServices from './pages/IntegratedServices';
import ContainerImageManagement from './pages/ContainerImageManagement';
import InferenceContainerTemplateManagement from './pages/InferenceContainerTemplateManagement';

import './style/App.css';
import AppThemeProvider from './contexts/ThemeContext';
import PageContainer from './components/common/PageContainer';
import EdgeDetails from './pages/EdgeDetails';
import Applications from './pages/Applications';
import ModelDetails from './pages/ModelDetails';
import { TasksProvider } from './contexts/TasksContext';
import OpenData from './pages/OpenData';
import EDCDebug from './pages/EDCDebug';
import Licenses from './pages/Licenses';
import AgentPage from './agent/components/AgentPage';
import { AGENT_ROUTE } from './agent/components/AgentLayer';
import { agentEnabled } from './agent/api';

const AppRoutes = () => (
    <Routes>
        {/* <Route path="/" element={<Dashboard />} /> */}
        <Route path="/" element={<DataManagement />} />
        <Route path="/docker" element={<Docker />} />
        <Route path="/data" element={<DataManagement />} />
        <Route path="/models" element={<ModelManagement />} />
        <Route path="/models/:id" element={<ModelDetails />} />
        <Route path="/train" element={<ModelTraining />} />
        <Route path="/container-images" element={<ContainerImageManagement />} />
        <Route path="/inference-container-templates" element={<InferenceContainerTemplateManagement />} />
        <Route path="/edge" element={<EdgeManagement />} />
        <Route path="/edge/:id" element={<EdgeDetails />} />
        <Route path="/edge-groups" element={<EdgeGroups />} />
        <Route path="/applications" element={<Applications />} />
        <Route path="/debug" element={<Debug />} />
        <Route path="/open-data" element={<OpenData />} />
        <Route path="/edc-debug" element={<EDCDebug />} />
        <Route path="/integrated-services" element={<IntegratedServices />} />
        <Route path="/network" element={<Network />} />
        <Route path="/licenses" element={<Licenses />} />
        {agentEnabled && <Route path={AGENT_ROUTE} element={<AgentPage />} />}
    </Routes>
);

export default function App() {
    return (
        <KeycloakProvider>
            <TasksProvider>
                <CvatProvider>
                    <CssBaseline />
                    <AppThemeProvider>
                        <BrowserRouter>
                            <PageContainer>
                                <AppRoutes />
                            </PageContainer>
                        </BrowserRouter>
                    </AppThemeProvider>
                </CvatProvider>
            </TasksProvider>
        </KeycloakProvider>
    );
}
