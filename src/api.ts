// SPDX-FileCopyrightText: 2024 Osnabrück University of Applied Sciences
// SPDX-FileContributor: Andreas Schliebitz
// SPDX-FileContributor: Henri Graf
// SPDX-FileContributor: Jonas Tüpker
// SPDX-FileContributor: Lukas Hesse
// SPDX-FileContributor: Maik Fruhner
// SPDX-FileContributor: Prof. Dr.-Ing. Heiko Tapken
// SPDX-FileContributor: Tobias Wamhof
//
// SPDX-License-Identifier: MIT

import { getReasonPhrase } from 'http-status-codes';

const PROJECT_BASE_URL = 'agri-gaia.localhost';
const DOWNLOAD_CONTENT_TYPES: { [key: string]: string } = {
    'application/x-zip-compressed': 'archive.zip',
    'application/octet-stream': 'data.bin',
    'application/json': 'data.json',
    'application/xml': 'data.xml',
};

const httpGet = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    headers?: Record<string, string>,
    returnResponseHeaders?: boolean,
) => requestAPI(keycloak, path, 'GET', headers, 'application/json', undefined, undefined, returnResponseHeaders);

const httpDelete = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    payload?: unknown,
    headers?: Record<string, string>,
    returnResponseHeaders?: boolean,
) => requestAPI(keycloak, path, 'DELETE', headers, 'application/json', payload, undefined, returnResponseHeaders);

const httpPost = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    payload?: unknown,
    headers?: Record<string, string>,
    returnResponseHeaders?: boolean,
) => requestAPI(keycloak, path, 'POST', headers, 'application/json', payload, undefined, returnResponseHeaders);

const httpPut = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    payload?: unknown,
    headers?: Record<string, string>,
    returnResponseHeaders?: boolean,
) => requestAPI(keycloak, path, 'PUT', headers, 'application/json', payload, undefined, returnResponseHeaders);

const httpPatch = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    payload?: unknown,
    headers?: Record<string, string>,
    returnResponseHeaders?: boolean,
) => requestAPI(keycloak, path, 'PATCH', headers, 'application/json', payload, undefined, returnResponseHeaders);

const httpUpload = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    formData?: FormData,
    headers?: Record<string, string>,
    returnResponseHeaders?: boolean,
) => requestAPI(keycloak, path, 'POST', headers, undefined, undefined, formData, returnResponseHeaders);

const requestAPI = async (
    keycloak: Keycloak.KeycloakInstance | undefined,
    path: string,
    method: string,
    headers?: Record<string, string>,
    contentType?: string,
    payload?: unknown,
    formData?: FormData,
    returnResponseHeaders?: boolean,
) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;

    if (keycloak?.authenticated) {
        let url = path;
        if (!(path.startsWith('https://') || path.startsWith('http://'))) {
            url = `https://api.${PROJECT_BASE_URL}${path}`;
        }

        try {
            const token_refreshed = await keycloak.updateToken(5);
            if (token_refreshed) {
                console.log('Updated Keycloak Access Token before making the request!');
            }
        } catch (e) {
            console.log('Error refreshing token:', e);
            throw CustomApiError(url, 500, 'Cannot refresh Keycloak Token');
        }

        if (!headers) headers = {};

        headers['Authorization'] = `Bearer ${keycloak.token}`;

        if (contentType) headers['Content-Type'] = contentType;

        const body = payload ? JSON.stringify(payload) : formData;

        const response = await fetch(url, {
            method,
            headers,
            body,
        });

        const responseContentType = response.headers.get('content-type');
        if (!response.ok)
            throw HttpError(url, response, responseContentType === 'application/json' ? await response.json() : null);

        if (responseContentType) {
            if (getContentDispositionHeader(response)) {
                if (responseContentType in DOWNLOAD_CONTENT_TYPES) {
                    const blob = await response.blob();
                    const defaultFileName = DOWNLOAD_CONTENT_TYPES[responseContentType];
                    const fileName = getFilenameFromResponse(response, defaultFileName);
                    data = { blob, fileName };
                } else {
                    const errorMsg = `Unknown response Content-Type '${responseContentType}' for file download.`;
                    console.error(errorMsg);
                    throw CustomApiError(url, 500, errorMsg);
                }
            } else if (responseContentType === 'application/json') {
                data = await response.json();
            } else {
                const errorMsg = `Unknown response Content-Type '${responseContentType}' for non file download.`;
                console.error(errorMsg);
                throw CustomApiError(url, 500, errorMsg);
            }
        }
        if (returnResponseHeaders) {
            return { data: data, headers: response.headers };
        }
        return data;
    } else {
        console.error('Trying to send request with unauthenticated keycloak');
    }
};

const getContentDispositionHeader = (response: Response): string | null => {
    return response.headers.get('content-disposition');
};

const getFilenameFromResponse = (response: Response, defaultFileName: string): string => {
    let fileName = defaultFileName;
    const contentDispositionHeader = getContentDispositionHeader(response);
    if (contentDispositionHeader) {
        const contentDispositionSplits = contentDispositionHeader.split(';');
        const fileNameSplit = contentDispositionSplits.find((split) => split.includes('filename'));
        if (fileNameSplit) fileName = fileNameSplit.split('=')[1];
    }
    return fileName;
};

const CustomApiError = (
    url: string,
    status: number,
    message: string,
): { url: string; status: number; message: string } => {
    return {
        url: url,
        status: status,
        message: message,
    };
};

const HttpError = (
    url: string,
    response: Response,
    body: string,
): { url: string; status: number; message: string; body: string } => {
    let statusText = response.statusText;
    if (!statusText) statusText = getReasonPhrase(response.status);
    return {
        url: url,
        status: response.status,
        message: `${response.status} - ${statusText}`,
        body: body,
    };
};

export { PROJECT_BASE_URL, httpGet, httpPost, httpPut, httpPatch, httpUpload, httpDelete };
