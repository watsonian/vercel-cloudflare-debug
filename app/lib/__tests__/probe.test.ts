import { describe, it, expect, vi } from "vitest";
import { Semaphore } from "../probe";

describe("Semaphore", () => {
  it("limits concurrency", async () => {
    const sem = new Semaphore(2);
    let running = 0;
    let maxRunning = 0;

    const task = async () => {
      await sem.acquire();
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 50));
      running--;
      sem.release();
    };

    await Promise.all([task(), task(), task(), task(), task()]);
    expect(maxRunning).toBe(2);
  });

  it("allows sequential execution with concurrency 1", async () => {
    const sem = new Semaphore(1);
    const order: number[] = [];

    const task = (n: number) => async () => {
      await sem.acquire();
      order.push(n);
      await new Promise((r) => setTimeout(r, 10));
      sem.release();
    };

    await Promise.all([task(1)(), task(2)(), task(3)()]);
    expect(order).toEqual([1, 2, 3]);
  });
});
