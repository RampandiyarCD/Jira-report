import axios from "axios";


export const loginService = async (email: string, url: string, token: string) => {

  const auth = Buffer.from(`${email}:${token}`).toString("base64");

  const response = await axios.get(
    `${url}/rest/api/3/myself`,
    {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: "application/json",
      },
    }
  );
  return { user: response.data, auth };
};