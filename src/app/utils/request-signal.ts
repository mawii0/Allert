// Safari before 17.4 supports Web Push but lacks AbortSignal.any().
// Keep caller cancellation and bounded requests without changing browser globals.
export function requestSignal(milliseconds:number, caller?:AbortSignal):AbortSignal {
  if (typeof AbortSignal.timeout === "function" && (!caller || typeof AbortSignal.any === "function")) {
    const timeout=AbortSignal.timeout(milliseconds);
    return caller?AbortSignal.any([caller,timeout]):timeout;
  }
  const controller=new AbortController();
  const abort=()=>{clearTimeout(timer);caller?.removeEventListener("abort",abort);controller.abort(caller?.reason ?? new DOMException("Request cancelled","AbortError"));};
  const timer=setTimeout(()=>{caller?.removeEventListener("abort",abort);controller.abort(new DOMException("Request timed out","TimeoutError"));},milliseconds);
  // Node verification should not be kept alive by a completed request's timer.
  (timer as unknown as {unref?:()=>void}).unref?.();
  if(caller?.aborted)abort();else caller?.addEventListener("abort",abort,{once:true});
  return controller.signal;
}
