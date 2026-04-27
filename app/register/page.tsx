export default function Register() {
  return (
    <div className="flex flex-1 items-center justify-center bg-white dark:bg-black">
      <div className="flex flex-col gap-8 w-full max-w-sm px-8">
        <h1 className="text-3xl font-bold tracking-tight text-black dark:text-white">
          Register
        </h1>
        <form className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-zinc-600 dark:text-zinc-400" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              className="h-11 rounded-lg border border-zinc-200 bg-white px-4 text-sm text-black outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm text-zinc-600 dark:text-zinc-400" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              placeholder="••••••••"
              className="h-11 rounded-lg border border-zinc-200 bg-white px-4 text-sm text-black outline-none transition-colors focus:border-black dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-white"
            />
          </div>
          <button
            type="submit"
            className="mt-2 h-11 rounded-full bg-black text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Register
          </button>
        </form>
        <p className="text-center text-sm text-zinc-500">
          Already have an account?{" "}
          <a href="/login" className="font-medium text-black underline-offset-4 hover:underline dark:text-white">
            Log in
          </a>
        </p>
      </div>
    </div>
  );
}
