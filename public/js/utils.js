function getQueryParamsObject() {
    const URL = window.location.href;
    const queryPrmObj = {};
    URL.slice(URL.indexOf("?") + 1).split('&').reduce((prev, curr) => {
        const [name, value] = curr.split('=');
        prev[name] = value;
        return prev;
    }, queryPrmObj);
    return queryPrmObj;
}
