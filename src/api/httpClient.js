import axios from "axios";

const httpClient = axios.create({
  timeout: 8000,
  headers: { Accept: "application/json" },
});

export default httpClient;
