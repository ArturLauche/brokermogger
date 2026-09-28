-- Published legal/template text is historical evidence. Corrections are new versions.
CREATE FUNCTION brokermogger_immutable_catalogue() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    IF coalesce(current_setting('brokermogger.allow_append_only_delete', true), 'off') <> 'on' THEN
      RAISE EXCEPTION 'Published catalogue history cannot be truncated' USING ERRCODE = '0A000';
    END IF;
    RETURN NULL;
  END IF;
  IF OLD.status = 'DRAFT' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND (to_jsonb(OLD) - ARRAY['status', 'updatedAt']) = (to_jsonb(NEW) - ARRAY['status', 'updatedAt'])
     AND (NEW.status = OLD.status
          OR (OLD.status = 'PUBLISHED' AND NEW.status IN ('SUPERSEDED', 'ARCHIVED'))
          OR (OLD.status = 'SUPERSEDED' AND NEW.status = 'ARCHIVED')) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Published catalogue versions are immutable; create a new version' USING ERRCODE = '0A000';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER legal_rule_version_immutable BEFORE UPDATE OR DELETE ON "LegalRuleVersion"
FOR EACH ROW EXECUTE FUNCTION brokermogger_immutable_catalogue();
CREATE TRIGGER template_version_immutable BEFORE UPDATE OR DELETE ON "RequestTemplateVersion"
FOR EACH ROW EXECUTE FUNCTION brokermogger_immutable_catalogue();
CREATE TRIGGER legal_rule_version_no_truncate BEFORE TRUNCATE ON "LegalRuleVersion"
FOR EACH STATEMENT EXECUTE FUNCTION brokermogger_immutable_catalogue();
CREATE TRIGGER template_version_no_truncate BEFORE TRUNCATE ON "RequestTemplateVersion"
FOR EACH STATEMENT EXECUTE FUNCTION brokermogger_immutable_catalogue();

-- A parent scope change would reinterpret all of its historical versions.
CREATE FUNCTION brokermogger_immutable_catalogue_scope() RETURNS trigger AS $$
BEGIN
  IF TG_TABLE_NAME = 'LegalRule' THEN
    IF (NEW."jurisdictionId", NEW.key) IS DISTINCT FROM (OLD."jurisdictionId", OLD.key)
       AND EXISTS (SELECT 1 FROM "LegalRuleVersion" WHERE "legalRuleId" = OLD.id AND status <> 'DRAFT') THEN
      RAISE EXCEPTION 'Published rule scope is immutable; create a new rule' USING ERRCODE = '0A000';
    END IF;
  ELSE
    IF (NEW.key, NEW."requestType", NEW.channel, NEW."jurisdictionId") IS DISTINCT FROM (OLD.key, OLD."requestType", OLD.channel, OLD."jurisdictionId")
       AND EXISTS (SELECT 1 FROM "RequestTemplateVersion" WHERE "templateId" = OLD.id AND status <> 'DRAFT') THEN
      RAISE EXCEPTION 'Published template scope is immutable; create a new template' USING ERRCODE = '0A000';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER legal_rule_scope_immutable BEFORE UPDATE ON "LegalRule"
FOR EACH ROW EXECUTE FUNCTION brokermogger_immutable_catalogue_scope();
CREATE TRIGGER template_scope_immutable BEFORE UPDATE ON "RequestTemplate"
FOR EACH ROW EXECUTE FUNCTION brokermogger_immutable_catalogue_scope();
