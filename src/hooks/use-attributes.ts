import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  attributesForPatient,
  attributesForProduct,
  createAttributeDef,
  listAllTargets,
  listAttributeDefs,
  listFilterableAttributes,
  listPatientFacetAttributes,
  listTargets,
  setAttributeArchived,
  setAttributeTargets,
  updateAttributeDef,
  type AttributeDefInput,
  type AttributeTargetInput,
} from "@/db/attributes";
import type { ProductCategory } from "@/types";

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: ["attribute-defs"] });
  qc.invalidateQueries({ queryKey: ["attributes-for-product"] });
  qc.invalidateQueries({ queryKey: ["attributes-for-patient"] });
  qc.invalidateQueries({ queryKey: ["patient-facet-attributes"] });
  qc.invalidateQueries({ queryKey: ["filterable-attributes"] });
  qc.invalidateQueries({ queryKey: ["all-attribute-targets"] });
  qc.invalidateQueries({ queryKey: ["attribute-targets"] });
};

export function useAttributeDefs(includeArchived = false) {
  return useQuery({
    queryKey: ["attribute-defs", { includeArchived }],
    queryFn: () => listAttributeDefs(includeArchived),
  });
}

export function useFilterableAttributes() {
  return useQuery({
    queryKey: ["filterable-attributes"],
    queryFn: listFilterableAttributes,
  });
}

export function useAllAttributeTargets() {
  return useQuery({ queryKey: ["all-attribute-targets"], queryFn: listAllTargets });
}

export function useAttributeTargets(attributeId: number | undefined) {
  return useQuery({
    queryKey: ["attribute-targets", attributeId ?? 0],
    queryFn: () => listTargets(attributeId as number),
    enabled: attributeId != null,
  });
}

export function useAttributesForProduct(args: {
  type: ProductCategory;
  categoryId: number | null;
  productId?: number | null;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: [
      "attributes-for-product",
      args.type,
      args.categoryId,
      args.productId ?? null,
    ],
    queryFn: () =>
      attributesForProduct({
        type: args.type,
        categoryId: args.categoryId,
        productId: args.productId,
      }),
    enabled: args.enabled ?? true,
  });
}

export function useAttributesForPatient(patientId?: number | null) {
  return useQuery({
    queryKey: ["attributes-for-patient", patientId ?? null],
    queryFn: () => attributesForPatient(patientId),
  });
}

export function usePatientFacetAttributes() {
  return useQuery({
    queryKey: ["patient-facet-attributes"],
    queryFn: listPatientFacetAttributes,
  });
}

export function useCreateAttributeDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AttributeDefInput) => createAttributeDef(input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateAttributeDef() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; input: AttributeDefInput }) =>
      updateAttributeDef(args.id, args.input),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetAttributeArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; archived: boolean }) =>
      setAttributeArchived(args.id, args.archived),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useSetAttributeTargets() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; targets: AttributeTargetInput[] }) =>
      setAttributeTargets(args.id, args.targets),
    onSuccess: () => invalidateAll(qc),
  });
}
