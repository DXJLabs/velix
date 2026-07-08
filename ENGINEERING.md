# Repository Rules

1. No handwritten source file may exceed 600 lines.

2. Preferred file size is 150-300 lines.

3. Features may not import other features.

4. Shared logic belongs in:
   - `domain/`
   - `services/`
   - `utils/`

5. Business logic never lives in UI.

6. UI never calls SDK directly.

7. Wallet logic only lives inside wallet services.

8. Contracts live only under `contracts/`.

9. Frontend lives only under `src/`.

10. Before every push, run:

    ```sh
    npm run build
    npm run test:sdk
    ```

    If either fails, do not push.
