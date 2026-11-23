<script lang="ts">
  import { api } from "./lib/api";

  let email = $state("");
  let password = $state("");
  let message = $state("");

  const login = async (e: SubmitEvent) => {
    e.preventDefault();
    const res = await api.auth.login.$post({ json: { email, password } });
    message = res.ok ? `Logged in as ${(await res.json()).user.name}` : "Login failed";
  };
</script>

<h1>Fizo</h1>

<form onsubmit={login}>
  <input type="email" placeholder="Email" bind:value={email} />
  <input type="password" placeholder="Password" bind:value={password} />
  <button>Log in</button>
</form>

<p>{message}</p>
