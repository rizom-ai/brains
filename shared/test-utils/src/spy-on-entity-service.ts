import { spyOn, type Mock } from "bun:test";
import { genericSpy } from "./generic-spy";
import type {
  BaseEntity,
  CreateEntityRequest,
  EntityMutationResult,
  GetEntityRequest,
  IEntityService,
} from "@brains/entity-service";

/**
 * Spy on `getEntity`, typed at its `T = BaseEntity` instantiation.
 *
 * `getEntity` is declared `<T extends BaseEntity>(request) => Promise<T | null>`.
 * A test stubbing it returns one concrete entity, which no generic signature
 * accepts — `T` could always be instantiated with a narrower subtype — so the
 * spy cannot be typed as the member it replaces. `genericSpy` does not help
 * here either: it yields the member type, and these tests need the `Mock`
 * methods (`mockResolvedValue`, `.mock.calls`) that the member type lacks.
 *
 * Naming the instantiation is the honest description: this spy answers as
 * `BaseEntity`, and a test wanting a narrower entity gets no guarantee from
 * the type. Six call sites were each asserting their own loose signature
 * before; the accommodation now lives here once, where it can be explained.
 */
export function spyOnEntityGet(
  service: Pick<IEntityService, "getEntity">,
): Mock<(request: GetEntityRequest) => Promise<BaseEntity | null>> {
  return genericSpy<
    Mock<(request: GetEntityRequest) => Promise<BaseEntity | null>>
  >(spyOn(service, "getEntity"));
}

/** Spy on `createEntity`, for the same reason as {@link spyOnEntityGet}. */
export function spyOnEntityCreate(
  service: Pick<IEntityService, "createEntity">,
): Mock<
  (request: CreateEntityRequest<BaseEntity>) => Promise<EntityMutationResult>
> {
  return genericSpy<
    Mock<
      (
        request: CreateEntityRequest<BaseEntity>,
      ) => Promise<EntityMutationResult>
    >
  >(spyOn(service, "createEntity"));
}
