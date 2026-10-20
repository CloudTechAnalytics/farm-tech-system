
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "activity_logs": {
                  Row: {
                    "batch_event_id": string | null,"batch_id": string | null,"category_id": string,"created_at": string,"crop_cycle_id": string | null,"feed_event_id": string | null,"finance_transaction_id": string | null,"id": string,"inventory_movement_id": string | null,"notes": string | null,"occurred_at": string | null,"occurred_on": string,"organization_id": string,"production_record_id": string | null,"production_type": string,"production_unit_id": string | null,"quantity": number | null,"recorded_by": string | null,"responsible_id": string | null,"sale_id": string | null,"site_id": string,"source": string,"summary": string,"unit_id": string | null,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_event_id"?: string | null,"batch_id"?: string | null,"category_id": string,"created_at"?: string,"crop_cycle_id"?: string | null,"feed_event_id"?: string | null,"finance_transaction_id"?: string | null,"id"?: string,"inventory_movement_id"?: string | null,"notes"?: string | null,"occurred_at"?: string | null,"occurred_on": string,"organization_id": string,"production_record_id"?: string | null,"production_type": string,"production_unit_id"?: string | null,"quantity"?: number | null,"recorded_by"?: string | null,"responsible_id"?: string | null,"sale_id"?: string | null,"site_id": string,"source": string,"summary": string,"unit_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "batch_event_id"?: string | null,"batch_id"?: string | null,"category_id"?: string,"created_at"?: string,"crop_cycle_id"?: string | null,"feed_event_id"?: string | null,"finance_transaction_id"?: string | null,"id"?: string,"inventory_movement_id"?: string | null,"notes"?: string | null,"occurred_at"?: string | null,"occurred_on"?: string,"organization_id"?: string,"production_record_id"?: string | null,"production_type"?: string,"production_unit_id"?: string | null,"quantity"?: number | null,"recorded_by"?: string | null,"responsible_id"?: string | null,"sale_id"?: string | null,"site_id"?: string,"source"?: string,"summary"?: string,"unit_id"?: string | null,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_logs_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: false
      referencedRelation: "batch_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: false
      referencedRelation: "batch_events_net"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "activity_logs_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "activity_logs_category_id_organization_id_fkey"
      columns: ["category_id","organization_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "activity_logs_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycle_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "activity_logs_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycles"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "activity_logs_feed_event_id_fkey"
      columns: ["feed_event_id"]
isOneToOne: false
      referencedRelation: "feed_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_finance_transaction_id_fkey"
      columns: ["finance_transaction_id"]
isOneToOne: false
      referencedRelation: "finance_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_inventory_movement_id_fkey"
      columns: ["inventory_movement_id"]
isOneToOne: false
      referencedRelation: "inventory_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_production_record_id_fkey"
      columns: ["production_record_id"]
isOneToOne: false
      referencedRelation: "production_record_balances"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_production_record_id_fkey"
      columns: ["production_record_id"]
isOneToOne: false
      referencedRelation: "production_records"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_production_unit_id_site_id_fkey"
      columns: ["production_unit_id","site_id"]
isOneToOne: false
      referencedRelation: "production_units"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "activity_logs_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_responsible_id_fkey"
      columns: ["responsible_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sale_summaries"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_sale_id_fkey"
      columns: ["sale_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_logs_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "activity_logs_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"alert_settings": {
                  Row: {
                    "fish_daily_mortality_pct": number,"low_stock_enabled": boolean,"missing_records_after_days": number,"missing_records_enabled": boolean,"mortality_alerts_enabled": boolean,"organization_id": string,"poultry_daily_mortality_pct": number,"production_rejection_pct": number,"upcoming_activity_days": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "fish_daily_mortality_pct"?: number,"low_stock_enabled"?: boolean,"missing_records_after_days"?: number,"missing_records_enabled"?: boolean,"mortality_alerts_enabled"?: boolean,"organization_id": string,"poultry_daily_mortality_pct"?: number,"production_rejection_pct"?: number,"upcoming_activity_days"?: number,"updated_at"?: string
                  }
                  Update: {
                    "fish_daily_mortality_pct"?: number,"low_stock_enabled"?: boolean,"missing_records_after_days"?: number,"missing_records_enabled"?: boolean,"mortality_alerts_enabled"?: boolean,"organization_id"?: string,"poultry_daily_mortality_pct"?: number,"production_rejection_pct"?: number,"upcoming_activity_days"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "alert_settings_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"attachments": {
                  Row: {
                    "created_at": string,"entity_id": string,"entity_type": string,"file_name": string,"id": string,"mime_type": string,"organization_id": string,"site_id": string,"size_bytes": number,"storage_path": string,"uploaded_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"entity_id": string,"entity_type": string,"file_name": string,"id"?: string,"mime_type": string,"organization_id": string,"site_id": string,"size_bytes": number,"storage_path": string,"uploaded_by"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"entity_id"?: string,"entity_type"?: string,"file_name"?: string,"id"?: string,"mime_type"?: string,"organization_id"?: string,"site_id"?: string,"size_bytes"?: number,"storage_path"?: string,"uploaded_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "attachments_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "attachments_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "attachments_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_events": {
                  Row: {
                    "action": string,"actor_id": string | null,"after_data": Json | null,"before_data": Json | null,"created_at": string,"entity_id": string | null,"entity_type": string,"id": number,"organization_id": string,"site_id": string | null,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type": string,"id"?: never,"organization_id": string,"site_id"?: string | null,"summary"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"after_data"?: Json | null,"before_data"?: Json | null,"created_at"?: string,"entity_id"?: string | null,"entity_type"?: string,"id"?: never,"organization_id"?: string,"site_id"?: string | null,"summary"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "audit_events_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "audit_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"batch_events": {
                  Row: {
                    "batch_id": string,"counterpart_batch_id": string | null,"created_at": string,"event_date": string,"id": string,"is_estimate": boolean,"kind": string,"organization_id": string,"quantity": number,"reason": string | null,"recorded_by": string | null,"reverses_event_id": string | null,"site_id": string,"transfer_group_id": string | null,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"counterpart_batch_id"?: string | null,"created_at"?: string,"event_date": string,"id"?: string,"is_estimate"?: boolean,"kind": string,"organization_id": string,"quantity": number,"reason"?: string | null,"recorded_by"?: string | null,"reverses_event_id"?: string | null,"site_id": string,"transfer_group_id"?: string | null,"weight_kg"?: number | null
                  }
                  Update: {
                    "batch_id"?: string,"counterpart_batch_id"?: string | null,"created_at"?: string,"event_date"?: string,"id"?: string,"is_estimate"?: boolean,"kind"?: string,"organization_id"?: string,"quantity"?: number,"reason"?: string | null,"recorded_by"?: string | null,"reverses_event_id"?: string | null,"site_id"?: string,"transfer_group_id"?: string | null,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "batch_events_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "batch_events_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "batch_events_counterpart_batch_id_organization_id_fkey"
      columns: ["counterpart_batch_id","organization_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "batch_events_counterpart_batch_id_organization_id_fkey"
      columns: ["counterpart_batch_id","organization_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "batch_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_reverses_event_id_fkey"
      columns: ["reverses_event_id"]
isOneToOne: true
      referencedRelation: "batch_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_reverses_event_id_fkey"
      columns: ["reverses_event_id"]
isOneToOne: true
      referencedRelation: "batch_events_net"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"batches": {
                  Row: {
                    "breed": string | null,"close_reason": string | null,"closed_on": string | null,"code": string,"count_basis": string,"created_at": string,"created_by": string | null,"expects_daily_records": boolean,"id": string,"initial_avg_weight_g": number | null,"initial_quantity": number,"notes": string | null,"organization_id": string,"production_type": string,"production_unit_id": string | null,"purpose": string,"site_id": string,"source": string | null,"species": string,"start_date": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "breed"?: string | null,"close_reason"?: string | null,"closed_on"?: string | null,"code": string,"count_basis": string,"created_at"?: string,"created_by"?: string | null,"expects_daily_records"?: boolean,"id"?: string,"initial_avg_weight_g"?: number | null,"initial_quantity": number,"notes"?: string | null,"organization_id": string,"production_type": string,"production_unit_id"?: string | null,"purpose": string,"site_id": string,"source"?: string | null,"species": string,"start_date": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "breed"?: string | null,"close_reason"?: string | null,"closed_on"?: string | null,"code"?: string,"count_basis"?: string,"created_at"?: string,"created_by"?: string | null,"expects_daily_records"?: boolean,"id"?: string,"initial_avg_weight_g"?: number | null,"initial_quantity"?: number,"notes"?: string | null,"organization_id"?: string,"production_type"?: string,"production_unit_id"?: string | null,"purpose"?: string,"site_id"?: string,"source"?: string | null,"species"?: string,"start_date"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_production_unit_id_site_id_fkey"
      columns: ["production_unit_id","site_id"]
isOneToOne: false
      referencedRelation: "production_units"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "batches_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"categories": {
                  Row: {
                    "code": string,"created_at": string,"id": string,"is_active": boolean,"is_system": boolean,"kind": string,"name": string,"organization_id": string,"production_type": string | null,"sort_order": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_system"?: boolean,"kind": string,"name": string,"organization_id": string,"production_type"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"id"?: string,"is_active"?: boolean,"is_system"?: boolean,"kind"?: string,"name"?: string,"organization_id"?: string,"production_type"?: string | null,"sort_order"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "categories_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"crop_cycles": {
                  Row: {
                    "area": number,"area_unit_id": string,"close_reason": string | null,"closed_on": string | null,"code": string,"created_at": string,"created_by": string | null,"crop": string,"expected_harvest_date": string | null,"id": string,"notes": string | null,"organization_id": string,"planting_date": string | null,"production_unit_id": string,"season": string | null,"site_id": string,"status": string,"updated_at": string,"variety": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "area": number,"area_unit_id": string,"close_reason"?: string | null,"closed_on"?: string | null,"code": string,"created_at"?: string,"created_by"?: string | null,"crop": string,"expected_harvest_date"?: string | null,"id"?: string,"notes"?: string | null,"organization_id": string,"planting_date"?: string | null,"production_unit_id": string,"season"?: string | null,"site_id": string,"status"?: string,"updated_at"?: string,"variety"?: string | null
                  }
                  Update: {
                    "area"?: number,"area_unit_id"?: string,"close_reason"?: string | null,"closed_on"?: string | null,"code"?: string,"created_at"?: string,"created_by"?: string | null,"crop"?: string,"expected_harvest_date"?: string | null,"id"?: string,"notes"?: string | null,"organization_id"?: string,"planting_date"?: string | null,"production_unit_id"?: string,"season"?: string | null,"site_id"?: string,"status"?: string,"updated_at"?: string,"variety"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "crop_cycles_area_unit_id_fkey"
      columns: ["area_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crop_cycles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crop_cycles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crop_cycles_production_unit_id_site_id_fkey"
      columns: ["production_unit_id","site_id"]
isOneToOne: false
      referencedRelation: "production_units"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "crop_cycles_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"farm_sites": {
                  Row: {
                    "address": string | null,"archived_at": string | null,"code": string | null,"contact_name": string | null,"contact_phone": string | null,"country": string,"created_at": string,"has_crops": boolean,"has_fish": boolean,"has_poultry": boolean,"id": string,"name": string,"notes": string | null,"organization_id": string,"size_hectares": number | null,"state_region": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived_at"?: string | null,"code"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"country"?: string,"created_at"?: string,"has_crops"?: boolean,"has_fish"?: boolean,"has_poultry"?: boolean,"id"?: string,"name": string,"notes"?: string | null,"organization_id": string,"size_hectares"?: number | null,"state_region"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived_at"?: string | null,"code"?: string | null,"contact_name"?: string | null,"contact_phone"?: string | null,"country"?: string,"created_at"?: string,"has_crops"?: boolean,"has_fish"?: boolean,"has_poultry"?: boolean,"id"?: string,"name"?: string,"notes"?: string | null,"organization_id"?: string,"size_hectares"?: number | null,"state_region"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "farm_sites_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"feed_events": {
                  Row: {
                    "batch_id": string,"created_at": string,"event_date": string,"id": string,"inventory_movement_id": string | null,"item_id": string,"kind": string,"notes": string | null,"organization_id": string,"quantity": number,"recorded_by": string | null,"reverses_feed_event_id": string | null,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id": string,"created_at"?: string,"event_date": string,"id"?: string,"inventory_movement_id"?: string | null,"item_id": string,"kind": string,"notes"?: string | null,"organization_id": string,"quantity": number,"recorded_by"?: string | null,"reverses_feed_event_id"?: string | null,"site_id": string
                  }
                  Update: {
                    "batch_id"?: string,"created_at"?: string,"event_date"?: string,"id"?: string,"inventory_movement_id"?: string | null,"item_id"?: string,"kind"?: string,"notes"?: string | null,"organization_id"?: string,"quantity"?: number,"recorded_by"?: string | null,"reverses_feed_event_id"?: string | null,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "feed_events_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "feed_events_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "feed_events_inventory_movement_id_fkey"
      columns: ["inventory_movement_id"]
isOneToOne: true
      referencedRelation: "inventory_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feed_events_item_id_organization_id_fkey"
      columns: ["item_id","organization_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "feed_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feed_events_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feed_events_reverses_feed_event_id_fkey"
      columns: ["reverses_feed_event_id"]
isOneToOne: true
      referencedRelation: "feed_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "feed_events_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"finance_transactions": {
                  Row: {
                    "amount": number,"batch_id": string | null,"category_id": string,"counterparty": string | null,"created_at": string,"crop_cycle_id": string | null,"currency": string,"description": string,"id": string,"inventory_movement_id": string | null,"kind": string,"organization_id": string,"payment_method": string | null,"production_type": string | null,"recorded_by": string | null,"reference": string | null,"reversal_reason": string | null,"reverses_id": string | null,"sale_id": string | null,"site_id": string | null,"status": string,"txn_date": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"batch_id"?: string | null,"category_id": string,"counterparty"?: string | null,"created_at"?: string,"crop_cycle_id"?: string | null,"currency": string,"description": string,"id"?: string,"inventory_movement_id"?: string | null,"kind": string,"organization_id": string,"payment_method"?: string | null,"production_type"?: string | null,"recorded_by"?: string | null,"reference"?: string | null,"reversal_reason"?: string | null,"reverses_id"?: string | null,"sale_id"?: string | null,"site_id"?: string | null,"status"?: string,"txn_date": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"batch_id"?: string | null,"category_id"?: string,"counterparty"?: string | null,"created_at"?: string,"crop_cycle_id"?: string | null,"currency"?: string,"description"?: string,"id"?: string,"inventory_movement_id"?: string | null,"kind"?: string,"organization_id"?: string,"payment_method"?: string | null,"production_type"?: string | null,"recorded_by"?: string | null,"reference"?: string | null,"reversal_reason"?: string | null,"reverses_id"?: string | null,"sale_id"?: string | null,"site_id"?: string | null,"status"?: string,"txn_date"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "finance_transactions_batch_id_organization_id_fkey"
      columns: ["batch_id","organization_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_batch_id_organization_id_fkey"
      columns: ["batch_id","organization_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_category_id_organization_id_fkey"
      columns: ["category_id","organization_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_crop_cycle_id_organization_id_fkey"
      columns: ["crop_cycle_id","organization_id"]
isOneToOne: false
      referencedRelation: "crop_cycle_summaries"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_crop_cycle_id_organization_id_fkey"
      columns: ["crop_cycle_id","organization_id"]
isOneToOne: false
      referencedRelation: "crop_cycles"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_inventory_movement_id_organization_id_fkey"
      columns: ["inventory_movement_id","organization_id"]
isOneToOne: false
      referencedRelation: "inventory_movements"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finance_transactions_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finance_transactions_reverses_id_fkey"
      columns: ["reverses_id"]
isOneToOne: true
      referencedRelation: "finance_transactions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "finance_transactions_sale_id_organization_id_fkey"
      columns: ["sale_id","organization_id"]
isOneToOne: false
      referencedRelation: "sale_summaries"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_sale_id_organization_id_fkey"
      columns: ["sale_id","organization_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "finance_transactions_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"fish_samples": {
                  Row: {
                    "avg_weight_g": number | null,"batch_id": string,"created_at": string,"id": string,"notes": string | null,"organization_id": string,"recorded_by": string | null,"sample_date": string,"sample_size": number,"site_id": string,"total_weight_g": number,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "avg_weight_g"?: never,"batch_id": string,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id": string,"recorded_by"?: string | null,"sample_date": string,"sample_size": number,"site_id": string,"total_weight_g": number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "avg_weight_g"?: never,"batch_id"?: string,"created_at"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"recorded_by"?: string | null,"sample_date"?: string,"sample_size"?: number,"site_id"?: string,"total_weight_g"?: number,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "fish_samples_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "fish_samples_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "fish_samples_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fish_samples_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "fish_samples_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"inventory_items": {
                  Row: {
                    "base_unit_id": string,"category_id": string,"created_at": string,"id": string,"is_feed": boolean,"name": string,"notes": string | null,"organization_id": string,"production_type": string | null,"reorder_level": number | null,"sku": string | null,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_unit_id": string,"category_id": string,"created_at"?: string,"id"?: string,"is_feed"?: boolean,"name": string,"notes"?: string | null,"organization_id": string,"production_type"?: string | null,"reorder_level"?: number | null,"sku"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "base_unit_id"?: string,"category_id"?: string,"created_at"?: string,"id"?: string,"is_feed"?: boolean,"name"?: string,"notes"?: string | null,"organization_id"?: string,"production_type"?: string | null,"reorder_level"?: number | null,"sku"?: string | null,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_base_unit_id_fkey"
      columns: ["base_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_items_category_id_organization_id_fkey"
      columns: ["category_id","organization_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "inventory_items_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                },"inventory_movements": {
                  Row: {
                    "batch_id": string | null,"conversion_factor": number,"created_at": string,"crop_cycle_id": string | null,"entered_quantity": number,"entered_unit_id": string,"id": string,"item_id": string,"movement_date": string,"movement_type": string,"organization_id": string,"quantity": number,"reason": string | null,"recorded_by": string | null,"reference": string | null,"reverses_movement_id": string | null,"site_id": string,"stock_count_id": string | null,"store_id": string,"supplier": string | null,"total_cost": number | null,"transfer_group_id": string | null,"unit_cost": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"conversion_factor": number,"created_at"?: string,"crop_cycle_id"?: string | null,"entered_quantity": number,"entered_unit_id": string,"id"?: string,"item_id": string,"movement_date": string,"movement_type": string,"organization_id": string,"quantity": number,"reason"?: string | null,"recorded_by"?: string | null,"reference"?: string | null,"reverses_movement_id"?: string | null,"site_id": string,"stock_count_id"?: string | null,"store_id": string,"supplier"?: string | null,"total_cost"?: number | null,"transfer_group_id"?: string | null,"unit_cost"?: number | null
                  }
                  Update: {
                    "batch_id"?: string | null,"conversion_factor"?: number,"created_at"?: string,"crop_cycle_id"?: string | null,"entered_quantity"?: number,"entered_unit_id"?: string,"id"?: string,"item_id"?: string,"movement_date"?: string,"movement_type"?: string,"organization_id"?: string,"quantity"?: number,"reason"?: string | null,"recorded_by"?: string | null,"reference"?: string | null,"reverses_movement_id"?: string | null,"site_id"?: string,"stock_count_id"?: string | null,"store_id"?: string,"supplier"?: string | null,"total_cost"?: number | null,"transfer_group_id"?: string | null,"unit_cost"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "inventory_movements_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "inventory_movements_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "inventory_movements_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycle_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "inventory_movements_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycles"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "inventory_movements_entered_unit_id_fkey"
      columns: ["entered_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_item_id_organization_id_fkey"
      columns: ["item_id","organization_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "inventory_movements_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_reverses_movement_id_fkey"
      columns: ["reverses_movement_id"]
isOneToOne: true
      referencedRelation: "inventory_movements"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "inventory_movements_stock_count_id_organization_id_fkey"
      columns: ["stock_count_id","organization_id"]
isOneToOne: false
      referencedRelation: "stock_counts"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "inventory_movements_store_id_site_id_fkey"
      columns: ["store_id","site_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"access_scope": string,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"organization_id": string,"role_id": string,"site_ids": (string)[],"status": string,"token_hash": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"access_scope"?: string,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id": string,"role_id": string,"site_ids"?: (string)[],"status"?: string,"token_hash": string,"updated_at"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"access_scope"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"organization_id"?: string,"role_id"?: string,"site_ids"?: (string)[],"status"?: string,"token_hash"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_role_id_organization_id_fkey"
      columns: ["role_id","organization_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"member_sites": {
                  Row: {
                    "created_at": string,"membership_id": string,"organization_id": string,"site_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"membership_id": string,"organization_id": string,"site_id": string
                  }
                  Update: {
                    "created_at"?: string,"membership_id"?: string,"organization_id"?: string,"site_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_sites_membership_id_organization_id_fkey"
      columns: ["membership_id","organization_id"]
isOneToOne: false
      referencedRelation: "memberships"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "member_sites_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"memberships": {
                  Row: {
                    "access_scope": string,"created_at": string,"id": string,"invited_by": string | null,"job_title": string | null,"joined_at": string,"organization_id": string,"removed_at": string | null,"role_id": string,"status": string,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "access_scope"?: string,"created_at"?: string,"id"?: string,"invited_by"?: string | null,"job_title"?: string | null,"joined_at"?: string,"organization_id": string,"removed_at"?: string | null,"role_id": string,"status"?: string,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "access_scope"?: string,"created_at"?: string,"id"?: string,"invited_by"?: string | null,"job_title"?: string | null,"joined_at"?: string,"organization_id"?: string,"removed_at"?: string | null,"role_id"?: string,"status"?: string,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "memberships_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "memberships_role_id_organization_id_fkey"
      columns: ["role_id","organization_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "memberships_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"organizations": {
                  Row: {
                    "address": string | null,"country": string,"created_at": string,"created_by": string | null,"currency": string,"email": string | null,"id": string,"name": string,"phone": string | null,"slug": string,"status": string,"timezone": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"email"?: string | null,"id"?: string,"name": string,"phone"?: string | null,"slug": string,"status"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"country"?: string,"created_at"?: string,"created_by"?: string | null,"currency"?: string,"email"?: string | null,"id"?: string,"name"?: string,"phone"?: string | null,"slug"?: string,"status"?: string,"timezone"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "organizations_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"permissions": {
                  Row: {
                    "area": string,"description": string,"key": string,"label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "area": string,"description": string,"key": string,"label": string,"sort_order"?: number
                  }
                  Update: {
                    "area"?: string,"description"?: string,"key"?: string,"label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"planned_activities": {
                  Row: {
                    "batch_id": string | null,"category_id": string,"completed_at": string | null,"created_at": string,"created_by": string | null,"crop_cycle_id": string | null,"due_on": string,"id": string,"notes": string | null,"organization_id": string,"production_type": string,"site_id": string,"status": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_id"?: string | null,"category_id": string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"crop_cycle_id"?: string | null,"due_on": string,"id"?: string,"notes"?: string | null,"organization_id": string,"production_type": string,"site_id": string,"status"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "batch_id"?: string | null,"category_id"?: string,"completed_at"?: string | null,"created_at"?: string,"created_by"?: string | null,"crop_cycle_id"?: string | null,"due_on"?: string,"id"?: string,"notes"?: string | null,"organization_id"?: string,"production_type"?: string,"site_id"?: string,"status"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "planned_activities_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "planned_activities_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "planned_activities_category_id_organization_id_fkey"
      columns: ["category_id","organization_id"]
isOneToOne: false
      referencedRelation: "categories"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "planned_activities_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planned_activities_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycle_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "planned_activities_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycles"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "planned_activities_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "planned_activities_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"plans": {
                  Row: {
                    "created_at": string,"is_active": boolean,"key": string,"max_members": number | null,"max_sites": number | null,"name": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"is_active"?: boolean,"key": string,"max_members"?: number | null,"max_sites"?: number | null,"name": string,"sort_order"?: number
                  }
                  Update: {
                    "created_at"?: string,"is_active"?: boolean,"key"?: string,"max_members"?: number | null,"max_sites"?: number | null,"name"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"platform_admins": {
                  Row: {
                    "granted_at": string,"note": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"note"?: string | null,"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"note"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "platform_admins_user_id_fkey"
      columns: ["user_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"production_disposals": {
                  Row: {
                    "created_at": string,"disposal_date": string,"id": string,"kind": string,"notes": string | null,"organization_id": string,"production_record_id": string,"quantity": number,"recorded_by": string | null,"sale_line_id": string | null,"site_id": string,"status": string,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"disposal_date": string,"id"?: string,"kind": string,"notes"?: string | null,"organization_id": string,"production_record_id": string,"quantity": number,"recorded_by"?: string | null,"sale_line_id"?: string | null,"site_id": string,"status"?: string,"voided_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"disposal_date"?: string,"id"?: string,"kind"?: string,"notes"?: string | null,"organization_id"?: string,"production_record_id"?: string,"quantity"?: number,"recorded_by"?: string | null,"sale_line_id"?: string | null,"site_id"?: string,"status"?: string,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_disposals_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_disposals_production_record_id_site_id_fkey"
      columns: ["production_record_id","site_id"]
isOneToOne: false
      referencedRelation: "production_record_balances"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_disposals_production_record_id_site_id_fkey"
      columns: ["production_record_id","site_id"]
isOneToOne: false
      referencedRelation: "production_records"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_disposals_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_disposals_sale_line_id_fkey"
      columns: ["sale_line_id"]
isOneToOne: true
      referencedRelation: "sale_lines"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_disposals_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"production_records": {
                  Row: {
                    "batch_event_id": string | null,"batch_id": string | null,"created_at": string,"crop_cycle_id": string | null,"destination": string | null,"grade": string | null,"head_count": number | null,"id": string,"is_estimate": boolean,"notes": string | null,"organization_id": string,"product": string,"production_type": string,"quantity": number,"record_date": string,"record_kind": string,"recorded_by": string | null,"rejected_quantity": number,"responsible_id": string | null,"site_id": string,"status": string,"unit_id": string,"void_reason": string | null,"voided_at": string | null,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_event_id"?: string | null,"batch_id"?: string | null,"created_at"?: string,"crop_cycle_id"?: string | null,"destination"?: string | null,"grade"?: string | null,"head_count"?: number | null,"id"?: string,"is_estimate"?: boolean,"notes"?: string | null,"organization_id": string,"product": string,"production_type": string,"quantity": number,"record_date": string,"record_kind": string,"recorded_by"?: string | null,"rejected_quantity"?: number,"responsible_id"?: string | null,"site_id": string,"status"?: string,"unit_id": string,"void_reason"?: string | null,"voided_at"?: string | null,"weight_kg"?: number | null
                  }
                  Update: {
                    "batch_event_id"?: string | null,"batch_id"?: string | null,"created_at"?: string,"crop_cycle_id"?: string | null,"destination"?: string | null,"grade"?: string | null,"head_count"?: number | null,"id"?: string,"is_estimate"?: boolean,"notes"?: string | null,"organization_id"?: string,"product"?: string,"production_type"?: string,"quantity"?: number,"record_date"?: string,"record_kind"?: string,"recorded_by"?: string | null,"rejected_quantity"?: number,"responsible_id"?: string | null,"site_id"?: string,"status"?: string,"unit_id"?: string,"void_reason"?: string | null,"voided_at"?: string | null,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_records_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: true
      referencedRelation: "batch_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: true
      referencedRelation: "batch_events_net"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycle_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycles"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_responsible_id_fkey"
      columns: ["responsible_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "production_records_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"production_units": {
                  Row: {
                    "area": number | null,"area_unit_id": string | null,"capacity": number | null,"capacity_note": string | null,"created_at": string,"id": string,"kind": string,"name": string,"notes": string | null,"organization_id": string,"production_type": string,"site_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "area"?: number | null,"area_unit_id"?: string | null,"capacity"?: number | null,"capacity_note"?: string | null,"created_at"?: string,"id"?: string,"kind": string,"name": string,"notes"?: string | null,"organization_id": string,"production_type": string,"site_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "area"?: number | null,"area_unit_id"?: string | null,"capacity"?: number | null,"capacity_note"?: string | null,"created_at"?: string,"id"?: string,"kind"?: string,"name"?: string,"notes"?: string | null,"organization_id"?: string,"production_type"?: string,"site_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "production_units_area_unit_id_fkey"
      columns: ["area_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_units_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_units_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"email": string,"full_name": string | null,"id": string,"phone": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"phone"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"phone"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"role_permissions": {
                  Row: {
                    "organization_id": string,"permission_key": string,"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "organization_id": string,"permission_key": string,"role_id": string
                  }
                  Update: {
                    "organization_id"?: string,"permission_key"?: string,"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_permissions_role_id_organization_id_fkey"
      columns: ["role_id","organization_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"role_template_permissions": {
                  Row: {
                    "permission_key": string,"role_key": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission_key": string,"role_key": string
                  }
                  Update: {
                    "permission_key"?: string,"role_key"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_template_permissions_permission_key_fkey"
      columns: ["permission_key"]
isOneToOne: false
      referencedRelation: "permissions"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "role_template_permissions_role_key_fkey"
      columns: ["role_key"]
isOneToOne: false
      referencedRelation: "role_templates"
      referencedColumns: ["key"]
    }
                  ]
                },"role_templates": {
                  Row: {
                    "description": string,"is_owner_role": boolean,"key": string,"name": string,"rank": number
                  }
                  ComputedFields: never
                  Insert: {
                    "description": string,"is_owner_role"?: boolean,"key": string,"name": string,"rank": number
                  }
                  Update: {
                    "description"?: string,"is_owner_role"?: boolean,"key"?: string,"name"?: string,"rank"?: number
                  }
                  Relationships: [
                    
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"description": string | null,"id": string,"is_owner_role": boolean,"name": string,"organization_id": string,"rank": number,"template_key": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_owner_role"?: boolean,"name": string,"organization_id": string,"rank"?: number,"template_key"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string | null,"id"?: string,"is_owner_role"?: boolean,"name"?: string,"organization_id"?: string,"rank"?: number,"template_key"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "roles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "roles_template_key_fkey"
      columns: ["template_key"]
isOneToOne: false
      referencedRelation: "role_templates"
      referencedColumns: ["key"]
    }
                  ]
                },"sale_lines": {
                  Row: {
                    "batch_event_id": string | null,"batch_id": string | null,"created_at": string,"description": string,"id": string,"line_total": number | null,"line_type": string,"organization_id": string,"production_record_id": string | null,"quantity": number,"sale_id": string,"site_id": string,"unit_id": string,"unit_price": number,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "batch_event_id"?: string | null,"batch_id"?: string | null,"created_at"?: string,"description": string,"id"?: string,"line_total"?: never,"line_type": string,"organization_id": string,"production_record_id"?: string | null,"quantity": number,"sale_id": string,"site_id": string,"unit_id": string,"unit_price": number,"weight_kg"?: number | null
                  }
                  Update: {
                    "batch_event_id"?: string | null,"batch_id"?: string | null,"created_at"?: string,"description"?: string,"id"?: string,"line_total"?: never,"line_type"?: string,"organization_id"?: string,"production_record_id"?: string | null,"quantity"?: number,"sale_id"?: string,"site_id"?: string,"unit_id"?: string,"unit_price"?: number,"weight_kg"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sale_lines_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: true
      referencedRelation: "batch_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_lines_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: true
      referencedRelation: "batch_events_net"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_lines_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "sale_lines_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "sale_lines_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sale_lines_production_record_id_site_id_fkey"
      columns: ["production_record_id","site_id"]
isOneToOne: false
      referencedRelation: "production_record_balances"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "sale_lines_production_record_id_site_id_fkey"
      columns: ["production_record_id","site_id"]
isOneToOne: false
      referencedRelation: "production_records"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "sale_lines_sale_id_site_id_fkey"
      columns: ["sale_id","site_id"]
isOneToOne: false
      referencedRelation: "sale_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "sale_lines_sale_id_site_id_fkey"
      columns: ["sale_id","site_id"]
isOneToOne: false
      referencedRelation: "sales"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "sale_lines_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"sales": {
                  Row: {
                    "created_at": string,"currency": string,"customer_name": string | null,"customer_phone": string | null,"id": string,"notes": string | null,"organization_id": string,"recorded_by": string | null,"sale_date": string,"site_id": string,"status": string,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency": string,"customer_name"?: string | null,"customer_phone"?: string | null,"id"?: string,"notes"?: string | null,"organization_id": string,"recorded_by"?: string | null,"sale_date": string,"site_id": string,"status"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"customer_name"?: string | null,"customer_phone"?: string | null,"id"?: string,"notes"?: string | null,"organization_id"?: string,"recorded_by"?: string | null,"sale_date"?: string,"site_id"?: string,"status"?: string,"void_reason"?: string | null,"voided_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "sales_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"stock_counts": {
                  Row: {
                    "count_date": string,"counted_quantity": number,"created_at": string,"id": string,"item_id": string,"organization_id": string,"reason": string | null,"recorded_by": string | null,"site_id": string,"store_id": string,"system_quantity": number,"variance": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "count_date": string,"counted_quantity": number,"created_at"?: string,"id"?: string,"item_id": string,"organization_id": string,"reason"?: string | null,"recorded_by"?: string | null,"site_id": string,"store_id": string,"system_quantity": number,"variance"?: never
                  }
                  Update: {
                    "count_date"?: string,"counted_quantity"?: number,"created_at"?: string,"id"?: string,"item_id"?: string,"organization_id"?: string,"reason"?: string | null,"recorded_by"?: string | null,"site_id"?: string,"store_id"?: string,"system_quantity"?: number,"variance"?: never
                  }
                  Relationships: [
                    {
      foreignKeyName: "stock_counts_item_id_organization_id_fkey"
      columns: ["item_id","organization_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stock_counts_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stock_counts_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "stock_counts_store_id_site_id_fkey"
      columns: ["store_id","site_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"stores": {
                  Row: {
                    "created_at": string,"id": string,"is_default": boolean,"name": string,"organization_id": string,"site_id": string,"status": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"name": string,"organization_id": string,"site_id": string,"status"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_default"?: boolean,"name"?: string,"organization_id"?: string,"site_id"?: string,"status"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "stores_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "stores_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"subscriptions": {
                  Row: {
                    "created_at": string,"organization_id": string,"plan_key": string,"status": string,"trial_ends_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"organization_id": string,"plan_key": string,"status"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"organization_id"?: string,"plan_key"?: string,"status"?: string,"trial_ends_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "subscriptions_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: true
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "subscriptions_plan_key_fkey"
      columns: ["plan_key"]
isOneToOne: false
      referencedRelation: "plans"
      referencedColumns: ["key"]
    }
                  ]
                },"units": {
                  Row: {
                    "code": string,"created_at": string,"dimension": string,"id": string,"is_active": boolean,"name": string,"organization_id": string | null,"symbol": string,"to_base": number
                  }
                  ComputedFields: never
                  Insert: {
                    "code": string,"created_at"?: string,"dimension": string,"id"?: string,"is_active"?: boolean,"name": string,"organization_id"?: string | null,"symbol": string,"to_base": number
                  }
                  Update: {
                    "code"?: string,"created_at"?: string,"dimension"?: string,"id"?: string,"is_active"?: boolean,"name"?: string,"organization_id"?: string | null,"symbol"?: string,"to_base"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "units_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "batch_events_net": {
                  Row: {
                    "batch_id": string | null,"counterpart_batch_id": string | null,"created_at": string | null,"effective_kind": string | null,"event_date": string | null,"id": string | null,"is_estimate": boolean | null,"kind": string | null,"organization_id": string | null,"quantity": number | null,"reason": string | null,"recorded_by": string | null,"reverses_event_id": string | null,"site_id": string | null,"transfer_group_id": string | null,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "batch_events_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "batch_events_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "batch_events_counterpart_batch_id_organization_id_fkey"
      columns: ["counterpart_batch_id","organization_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "batch_events_counterpart_batch_id_organization_id_fkey"
      columns: ["counterpart_batch_id","organization_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "batch_events_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_reverses_event_id_fkey"
      columns: ["reverses_event_id"]
isOneToOne: true
      referencedRelation: "batch_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_reverses_event_id_fkey"
      columns: ["reverses_event_id"]
isOneToOne: true
      referencedRelation: "batch_events_net"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batch_events_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"batch_summaries": {
                  Row: {
                    "breed": string | null,"close_reason": string | null,"closed_on": string | null,"code": string | null,"count_basis": string | null,"created_at": string | null,"created_by": string | null,"current_population": number | null,"estimated_biomass_kg": number | null,"expects_daily_records": boolean | null,"feed_at_batch_kg": number | null,"feed_consumed_kg": number | null,"id": string | null,"initial_avg_weight_g": number | null,"initial_quantity": number | null,"latest_avg_weight_g": number | null,"latest_sample_date": string | null,"mortality_pct": number | null,"notes": string | null,"organization_id": string | null,"production_type": string | null,"production_unit_id": string | null,"production_unit_name": string | null,"purpose": string | null,"site_id": string | null,"site_name": string | null,"source": string | null,"species": string | null,"start_date": string | null,"status": string | null,"total_culled": number | null,"total_harvested": number | null,"total_mortality": number | null,"total_other_losses": number | null,"total_placed": number | null,"total_sold": number | null,"total_transferred_out": number | null,"updated_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "batches_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "batches_production_unit_id_site_id_fkey"
      columns: ["production_unit_id","site_id"]
isOneToOne: false
      referencedRelation: "production_units"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "batches_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"crop_cycle_summaries": {
                  Row: {
                    "area": number | null,"area_ha": number | null,"area_unit_id": string | null,"area_unit_symbol": string | null,"close_reason": string | null,"closed_on": string | null,"code": string | null,"created_at": string | null,"created_by": string | null,"crop": string | null,"expected_harvest_date": string | null,"harvest_kg": number | null,"harvest_records": number | null,"id": string | null,"notes": string | null,"organization_id": string | null,"planting_date": string | null,"production_unit_id": string | null,"production_unit_name": string | null,"season": string | null,"site_id": string | null,"site_name": string | null,"status": string | null,"updated_at": string | null,"variety": string | null,"yield_kg_per_ha": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "crop_cycles_area_unit_id_fkey"
      columns: ["area_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crop_cycles_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crop_cycles_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "crop_cycles_production_unit_id_site_id_fkey"
      columns: ["production_unit_id","site_id"]
isOneToOne: false
      referencedRelation: "production_units"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "crop_cycles_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                },"inventory_balances": {
                  Row: {
                    "base_unit_id": string | null,"category_id": string | null,"category_name": string | null,"is_feed": boolean | null,"item_id": string | null,"item_name": string | null,"last_movement_date": string | null,"organization_id": string | null,"production_type": string | null,"quantity": number | null,"reorder_level": number | null,"site_id": string | null,"site_name": string | null,"store_id": string | null,"store_name": string | null,"unit_symbol": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "inventory_items_base_unit_id_fkey"
      columns: ["base_unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_item_id_organization_id_fkey"
      columns: ["item_id","organization_id"]
isOneToOne: false
      referencedRelation: "inventory_items"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "inventory_movements_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "inventory_movements_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "inventory_movements_store_id_site_id_fkey"
      columns: ["store_id","site_id"]
isOneToOne: false
      referencedRelation: "stores"
      referencedColumns: ["id","site_id"]
    }
                  ]
                },"production_record_balances": {
                  Row: {
                    "available_quantity": number | null,"batch_event_id": string | null,"batch_id": string | null,"created_at": string | null,"crop_cycle_id": string | null,"destination": string | null,"disposed_quantity": number | null,"grade": string | null,"head_count": number | null,"id": string | null,"is_estimate": boolean | null,"notes": string | null,"organization_id": string | null,"product": string | null,"production_type": string | null,"quantity": number | null,"record_date": string | null,"record_kind": string | null,"recorded_by": string | null,"rejected_quantity": number | null,"responsible_id": string | null,"site_id": string | null,"site_name": string | null,"sold_quantity": number | null,"source_code": string | null,"status": string | null,"unit_dimension": string | null,"unit_id": string | null,"unit_symbol": string | null,"unit_to_base": number | null,"void_reason": string | null,"voided_at": string | null,"weight_kg": number | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "production_records_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: true
      referencedRelation: "batch_events"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_batch_event_id_fkey"
      columns: ["batch_event_id"]
isOneToOne: true
      referencedRelation: "batch_events_net"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batch_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_batch_id_site_id_fkey"
      columns: ["batch_id","site_id"]
isOneToOne: false
      referencedRelation: "batches"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycle_summaries"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_crop_cycle_id_site_id_fkey"
      columns: ["crop_cycle_id","site_id"]
isOneToOne: false
      referencedRelation: "crop_cycles"
      referencedColumns: ["id","site_id"]
    },{
      foreignKeyName: "production_records_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_responsible_id_fkey"
      columns: ["responsible_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "production_records_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    },{
      foreignKeyName: "production_records_unit_id_fkey"
      columns: ["unit_id"]
isOneToOne: false
      referencedRelation: "units"
      referencedColumns: ["id"]
    }
                  ]
                },"sale_summaries": {
                  Row: {
                    "amount_outstanding": number | null,"amount_received": number | null,"created_at": string | null,"currency": string | null,"customer_name": string | null,"customer_phone": string | null,"id": string | null,"line_count": number | null,"notes": string | null,"organization_id": string | null,"recorded_by": string | null,"sale_date": string | null,"site_id": string | null,"site_name": string | null,"status": string | null,"total_amount": number | null,"void_reason": string | null,"voided_at": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "sales_organization_id_fkey"
      columns: ["organization_id"]
isOneToOne: false
      referencedRelation: "organizations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sales_site_id_organization_id_fkey"
      columns: ["site_id","organization_id"]
isOneToOne: false
      referencedRelation: "farm_sites"
      referencedColumns: ["id","organization_id"]
    }
                  ]
                }
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"attachment_path_ok":
{ Args: { "p_name": string }; Returns: boolean
                           },
"can":
{ Args: { "p_org": string,"p_perm": string,"p_site": string }; Returns: boolean
                           },
"can_attach":
{ Args: { "p_entity_type": string,"p_org": string,"p_site": string }; Returns: boolean
                           },
"close_batch":
{ Args: { "p_batch": string,"p_closed_on": string,"p_reason": string,"p_write_off_remaining"?: boolean }; Returns: Json
                           },
"create_batch":
{ Args: { "p_breed"?: string,"p_code": string,"p_count_basis"?: string,"p_expects_daily_records"?: boolean,"p_initial_avg_weight_g"?: number,"p_initial_quantity": number,"p_key": string,"p_notes"?: string,"p_org": string,"p_payment_method"?: string,"p_production_type": string,"p_production_unit"?: string,"p_purchase_amount"?: number,"p_purpose": string,"p_site": string,"p_source"?: string,"p_species": string,"p_start_date": string,"p_start_kind"?: string }; Returns: Json
                           },
"create_crop_cycle":
{ Args: { "p_area": number,"p_area_unit": string,"p_code": string,"p_crop": string,"p_expected_harvest_date"?: string,"p_notes"?: string,"p_org": string,"p_planting_date"?: string,"p_production_unit": string,"p_season"?: string,"p_site": string,"p_variety"?: string }; Returns: string
                           },
"create_invitation":
{ Args: { "p_access_scope"?: string,"p_email": string,"p_org": string,"p_role": string,"p_site_ids"?: (string)[] }; Returns: Json
                           },
"create_organization":
{ Args: { "p_country"?: string,"p_currency"?: string,"p_name": string,"p_timezone"?: string }; Returns: string
                           },
"create_role":
{ Args: { "p_description": string,"p_name": string,"p_org": string,"p_permission_keys": (string)[] }; Returns: string
                           },
"create_site":
{ Args: { "p_address"?: string,"p_code"?: string,"p_contact_name"?: string,"p_contact_phone"?: string,"p_country"?: string,"p_has_crops"?: boolean,"p_has_fish"?: boolean,"p_has_poultry"?: boolean,"p_name": string,"p_notes"?: string,"p_org": string,"p_size_hectares"?: number,"p_state_region"?: string }; Returns: string
                           },
"dashboard_summary":
{ Args: { "p_from": string,"p_org": string,"p_production_type"?: string,"p_site"?: string,"p_to": string }; Returns: Json
                           },
"get_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"has_permission":
{ Args: { "p_org": string,"p_perm": string }; Returns: boolean
                           },
"has_site_access":
{ Args: { "p_org": string,"p_site": string }; Returns: boolean
                           },
"is_org_member":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_org_owner":
{ Args: { "p_org": string }; Returns: boolean
                           },
"is_platform_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"issue_feed":
{ Args: { "p_batch": string,"p_consumed_now"?: boolean,"p_event_date": string,"p_item": string,"p_key": string,"p_notes"?: string,"p_quantity": number,"p_store": string,"p_unit": string }; Returns: Json
                           },
"log_activity":
{ Args: { "p_batch"?: string,"p_category": string,"p_crop_cycle"?: string,"p_key": string,"p_notes"?: string,"p_occurred_at"?: string,"p_occurred_on": string,"p_org": string,"p_production_type": string,"p_production_unit"?: string,"p_quantity"?: number,"p_responsible"?: string,"p_site": string,"p_summary": string,"p_unit"?: string }; Returns: Json
                           },
"org_alerts":
{ Args: { "p_org": string,"p_site"?: string }; Returns: {
              "alert_date": string,"alert_key": string,"detail": string,"entity_id": string,"entity_type": string,"kind": string,"severity": string,"site_id": string,"site_name": string,"title": string
            }[]
                           },
"org_today":
{ Args: { "p_org": string }; Returns: string
                           },
"platform_overview":
{ Args: Record<PropertyKey, never>; Returns: Json
                           },
"record_crop_harvest":
{ Args: { "p_cycle": string,"p_destination"?: string,"p_grade"?: string,"p_key": string,"p_mark_harvested"?: boolean,"p_notes"?: string,"p_product"?: string,"p_quantity": number,"p_record_date": string,"p_rejected_quantity"?: number,"p_responsible"?: string,"p_unit": string }; Returns: Json
                           },
"record_disposal":
{ Args: { "p_disposal_date": string,"p_key": string,"p_kind": string,"p_notes"?: string,"p_quantity": number,"p_record": string }; Returns: Json
                           },
"record_egg_collection":
{ Args: { "p_batch": string,"p_grade"?: string,"p_key": string,"p_notes"?: string,"p_quantity": number,"p_record_date": string,"p_rejected_quantity"?: number,"p_responsible"?: string,"p_unit": string }; Returns: Json
                           },
"record_feed_use":
{ Args: { "p_batch": string,"p_event_date": string,"p_item": string,"p_key": string,"p_kind": string,"p_notes"?: string,"p_quantity": number,"p_unit": string }; Returns: Json
                           },
"record_finance_transaction":
{ Args: { "p_amount": number,"p_batch"?: string,"p_category": string,"p_counterparty"?: string,"p_crop_cycle"?: string,"p_description": string,"p_key": string,"p_kind": string,"p_org": string,"p_payment_method"?: string,"p_production_type"?: string,"p_reference"?: string,"p_site"?: string,"p_txn_date": string }; Returns: Json
                           },
"record_fish_harvest":
{ Args: { "p_batch": string,"p_count_is_estimate"?: boolean,"p_destination"?: string,"p_final_harvest"?: boolean,"p_grade"?: string,"p_head_count": number,"p_key": string,"p_notes"?: string,"p_record_date": string,"p_rejected_kg"?: number,"p_weight_kg": number }; Returns: Json
                           },
"record_fish_sample":
{ Args: { "p_batch": string,"p_key": string,"p_notes"?: string,"p_sample_date": string,"p_sample_size": number,"p_total_weight_g": number }; Returns: Json
                           },
"record_population_change":
{ Args: { "p_batch": string,"p_event_date": string,"p_key": string,"p_kind": string,"p_notes"?: string,"p_quantity": number,"p_reason"?: string,"p_responsible"?: string }; Returns: Json
                           },
"record_sale":
{ Args: { "p_amount_received"?: number,"p_customer_name"?: string,"p_customer_phone"?: string,"p_key": string,"p_lines": Json,"p_notes"?: string,"p_org": string,"p_payment_method"?: string,"p_reference"?: string,"p_sale_date": string,"p_site": string }; Returns: Json
                           },
"record_sale_payment":
{ Args: { "p_amount": number,"p_key": string,"p_payment_date": string,"p_payment_method": string,"p_reference"?: string,"p_sale": string }; Returns: Json
                           },
"record_stock_count":
{ Args: { "p_count_date": string,"p_counted_quantity": number,"p_item": string,"p_key": string,"p_reason"?: string,"p_store": string,"p_unit": string }; Returns: Json
                           },
"record_stock_receipt":
{ Args: { "p_expense_category"?: string,"p_item": string,"p_key": string,"p_movement_date": string,"p_movement_type": string,"p_payment_method"?: string,"p_quantity": number,"p_reason"?: string,"p_record_expense"?: boolean,"p_reference"?: string,"p_store": string,"p_supplier"?: string,"p_total_cost"?: number,"p_unit": string }; Returns: Json
                           },
"record_stock_usage":
{ Args: { "p_activity_code"?: string,"p_crop_cycle"?: string,"p_item": string,"p_key": string,"p_movement_date": string,"p_quantity": number,"p_reason"?: string,"p_store": string,"p_unit": string }; Returns: Json
                           },
"record_stock_wastage":
{ Args: { "p_item": string,"p_key": string,"p_movement_date": string,"p_quantity": number,"p_reason": string,"p_store": string,"p_unit": string }; Returns: Json
                           },
"report_cycle_performance":
{ Args: { "p_include_closed"?: boolean,"p_org": string,"p_production_type"?: string,"p_site"?: string }; Returns: {
              "code": string,"ended_on": string,"feed_consumed_kg": number,"id": string,"kind": string,"label": string,"linked_expense": number,"linked_income": number,"linked_surplus": number,"mortality_pct": number,"output_quantity": number,"output_unit": string,"placed": number,"production_type": string,"site_name": string,"started_on": string,"status": string,"yield_kg_per_ha": number
            }[]
                           },
"report_feed":
{ Args: { "p_from": string,"p_org": string,"p_production_type"?: string,"p_site"?: string,"p_to": string }; Returns: {
              "batch_code": string,"batch_id": string,"consumed": number,"consumed_per_head_g": number,"held_at_batch": number,"issued": number,"item_id": string,"item_name": string,"population": number,"production_type": string,"returned": number,"site_name": string,"unit_symbol": string,"wasted": number
            }[]
                           },
"report_finance_by_category":
{ Args: { "p_from": string,"p_org": string,"p_production_type"?: string,"p_site"?: string,"p_to": string }; Returns: {
              "amount": number,"category_id": string,"category_name": string,"kind": string,"transactions": number
            }[]
                           },
"report_finance_monthly":
{ Args: { "p_from": string,"p_org": string,"p_production_type"?: string,"p_site"?: string,"p_to": string }; Returns: {
              "expense": number,"income": number,"month": string,"net": number,"transactions": number
            }[]
                           },
"report_inputs_used":
{ Args: { "p_from": string,"p_org": string,"p_site"?: string,"p_to": string }; Returns: {
              "item_name": string,"quantity": number,"target_code": string,"target_id": string,"target_kind": string,"unit_symbol": string
            }[]
                           },
"report_mortality":
{ Args: { "p_from": string,"p_org": string,"p_production_type"?: string,"p_site"?: string,"p_to": string }; Returns: {
              "added": number,"batch_code": string,"batch_id": string,"closing_population": number,"count_basis": string,"culled": number,"mortality": number,"mortality_pct": number,"opening_population": number,"other_out": number,"production_type": string,"site_name": string,"species": string
            }[]
                           },
"report_production":
{ Args: { "p_from": string,"p_org": string,"p_production_type"?: string,"p_site"?: string,"p_to": string }; Returns: {
              "available": number,"base_unit": string,"good_quantity": number,"has_estimates": boolean,"other_disposed": number,"product": string,"production_type": string,"quantity": number,"record_kind": string,"records": number,"rejected": number,"site_name": string,"sold": number,"source_code": string,"source_id": string
            }[]
                           },
"report_sales":
{ Args: { "p_from": string,"p_org": string,"p_site"?: string,"p_to": string }; Returns: {
              "line_type": string,"product": string,"quantity": number,"sales": number,"sales_value": number,"unit_symbol": string
            }[]
                           },
"report_site_performance":
{ Args: { "p_from": string,"p_org": string,"p_to": string }; Returns: {
              "active_batches": number,"active_crop_cycles": number,"crop_harvest_kg": number,"eggs_collected": number,"expense": number,"feed_consumed_kg": number,"fish_harvest_kg": number,"income": number,"mortality": number,"operating_surplus": number,"site_id": string,"site_name": string
            }[]
                           },
"report_stock_movements":
{ Args: { "p_from": string,"p_org": string,"p_site"?: string,"p_to": string }; Returns: {
              "adjusted": number,"category_name": string,"closing": number,"issued": number,"item_id": string,"item_name": string,"opening": number,"received": number,"reorder_level": number,"returned": number,"site_name": string,"store_id": string,"store_name": string,"transferred_in": number,"transferred_out": number,"unit_symbol": string,"used": number,"wasted": number
            }[]
                           },
"return_feed":
{ Args: { "p_batch": string,"p_event_date": string,"p_item": string,"p_key": string,"p_notes"?: string,"p_quantity": number,"p_store": string,"p_unit": string }; Returns: Json
                           },
"reverse_batch_event":
{ Args: { "p_event": string,"p_key": string,"p_reason": string }; Returns: Json
                           },
"reverse_feed_event":
{ Args: { "p_feed_event": string,"p_key": string,"p_reason": string }; Returns: Json
                           },
"reverse_finance_transaction":
{ Args: { "p_key": string,"p_reason": string,"p_transaction": string }; Returns: Json
                           },
"reverse_inventory_movement":
{ Args: { "p_key": string,"p_movement": string,"p_reason": string }; Returns: Json
                           },
"revoke_invitation":
{ Args: { "p_invitation": string }; Returns: undefined
                           },
"set_crop_cycle_status":
{ Args: { "p_cycle": string,"p_date"?: string,"p_reason"?: string,"p_status": string }; Returns: undefined
                           },
"set_member_status":
{ Args: { "p_membership": string,"p_status": string }; Returns: undefined
                           },
"set_role_permissions":
{ Args: { "p_permission_keys": (string)[],"p_role": string }; Returns: undefined
                           },
"set_site_status":
{ Args: { "p_site": string,"p_status": string }; Returns: undefined
                           },
"shares_organization":
{ Args: { "p_user": string }; Returns: boolean
                           },
"transfer_between_batches":
{ Args: { "p_event_date": string,"p_from_batch": string,"p_key": string,"p_quantity": number,"p_reason"?: string,"p_to_batch": string }; Returns: Json
                           },
"transfer_stock":
{ Args: { "p_from_store": string,"p_item": string,"p_key": string,"p_movement_date": string,"p_quantity": number,"p_reason"?: string,"p_to_store": string,"p_unit": string }; Returns: Json
                           },
"update_batch_details":
{ Args: { "p_batch": string,"p_breed"?: string,"p_expects_daily_records"?: boolean,"p_notes"?: string,"p_production_unit"?: string,"p_source"?: string }; Returns: undefined
                           },
"update_crop_cycle_details":
{ Args: { "p_cycle": string,"p_expected_harvest_date"?: string,"p_notes"?: string,"p_season"?: string,"p_variety"?: string }; Returns: undefined
                           },
"update_member_access":
{ Args: { "p_access_scope": string,"p_job_title"?: string,"p_membership": string,"p_role": string,"p_site_ids"?: (string)[] }; Returns: undefined
                           },
"void_activity":
{ Args: { "p_activity": string,"p_reason": string }; Returns: undefined
                           },
"void_production_record":
{ Args: { "p_reason": string,"p_record": string }; Returns: undefined
                           },
"void_sale":
{ Args: { "p_key": string,"p_reason": string,"p_sale": string }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            
          }
        }
} as const
