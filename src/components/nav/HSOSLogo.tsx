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

import Box from '@mui/material/Box';
import React from 'react';
import hsosLogo from '../../imgs/hsos-logo-compact.png';

export default function HSOSLogo() {
    return (
        <Box sx={{ mr: { xs: 1, sm: 2 }, flex: 'none' }}>
            <Box component="img" src={hsosLogo} alt="" sx={{ height: { xs: 28, sm: 40 }, display: 'block' }} />
        </Box>
    );
}
